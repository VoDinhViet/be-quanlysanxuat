import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { ErrorCode } from '../../../constants/error-code.constant';
import { buildSignedFileUrl } from '../util/file-url.util';
import { FileSignatureGuard } from './file-signature.guard';

describe('FileSignatureGuard', () => {
  const SECRET = 'a-test-secret-at-least-32-characters-long';
  const FILE_ID = '11111111-1111-1111-1111-111111111111';

  let guard: FileSignatureGuard;

  const buildContext = (params: unknown, query: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ params, query }) }),
    }) as ExecutionContext;

  /** A live signature for FILE_ID, still valid for an hour. */
  const validQuery = (ttl = 3600) => {
    const url = buildSignedFileUrl(FILE_ID, SECRET, ttl);
    const search = new URLSearchParams(url.split('?')[1]);
    return {
      exp: search.get('exp') as string,
      sig: search.get('sig') as string,
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSignatureGuard,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => SECRET) },
        },
      ],
    }).compile();

    guard = module.get<FileSignatureGuard>(FileSignatureGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows a correctly signed, unexpired URL', () => {
    expect(
      guard.canActivate(buildContext({ fileId: FILE_ID }, validQuery())),
    ).toBe(true);
  });

  /**
   * Asserts the guard rejected with exactly `code`. Caught rather than matched through
   * `toThrow(expect.objectContaining(...))` because `AppException` puts the code in the
   * HttpException *response body*, which that matcher can only reach via an `any` cast.
   */
  const expectRejection = (context: ExecutionContext, code: ErrorCode) => {
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toMatchObject({ response: { errorCode: code } });
      return;
    }

    throw new Error(
      `expected the guard to reject with ${code}, but it allowed the request`,
    );
  };

  it('throws E044 when sig is missing', () => {
    const { exp } = validQuery();

    expectRejection(buildContext({ fileId: FILE_ID }, { exp }), ErrorCode.E044);
  });

  it('throws E044 when exp is missing', () => {
    const { sig } = validQuery();

    expectRejection(buildContext({ fileId: FILE_ID }, { sig }), ErrorCode.E044);
  });

  // A non-numeric `exp` must be rejected before it reaches the HMAC — otherwise it would be signed
  // over as a literal string and could be made to validate.
  it('throws E044 when exp is not an integer', () => {
    const { sig } = validQuery();

    for (const exp of ['', 'abc', '12abc', '1.5']) {
      expectRejection(
        buildContext({ fileId: FILE_ID }, { exp, sig }),
        ErrorCode.E044,
      );
    }
  });

  it('throws E044 for a tampered signature', () => {
    const { exp, sig } = validQuery();
    const tampered = `${sig.slice(0, -1)}${sig.at(-1) === 'A' ? 'B' : 'A'}`;

    expectRejection(
      buildContext({ fileId: FILE_ID }, { exp, sig: tampered }),
      ErrorCode.E044,
    );
  });

  it("throws E044 when another file's signature is replayed", () => {
    const query = validQuery();

    expectRejection(
      buildContext({ fileId: '22222222-2222-2222-2222-222222222222' }, query),
      ErrorCode.E044,
    );
  });

  // Signature is checked before expiry on purpose: answering "expired" to an invalid signature
  // would confirm to an attacker that the rest of their forgery was structurally correct.
  it('throws E045 (not E044) once a valid signature ages out', () => {
    expectRejection(
      buildContext({ fileId: FILE_ID }, validQuery(-10)),
      ErrorCode.E045,
    );
  });
});
