import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';
import { DateTime } from 'luxon';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import {
  buildXlsxBuffer,
  readXlsxRows,
  XLSX_MIME,
} from '../../common/utils/excel.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  bomItems,
  ItemSelect,
  bomOperations,
  boms,
  BomType,
  clients,
  files,
  itemFiles,
  items,
  ItemStatus,
  ItemType,
  orderItems,
  productionJobs,
  productionOrderItems,
  routingOperations,
  suppliers,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CopyItemReqDto } from './dto/copy-item.req.dto';
import { CreateItemReqDto } from './dto/create-item.req.dto';
import { ExportItemsReqDto } from './dto/export-items.req.dto';
import { GetItemIssuesReqDto } from './dto/get-item-issues.req.dto';
import { GetItemOptionsReqDto } from './dto/get-item-options.req.dto';
import { GetItemsReqDto } from './dto/get-items.req.dto';
import { ItemIssueResDto } from './dto/item-issue.res.dto';
import { ItemOptionResDto } from './dto/item-option.res.dto';
import { ItemResDto } from './dto/item.res.dto';
import { PageItemResDto } from './dto/page-item.res.dto';
import { UpdateItemReqDto } from './dto/update-item.req.dto';
import type { ItemCopyIdentity } from './types/item-copy-identity.type';
import type { ItemBomStructure } from './types/item-bom-structure.type';
import { ITEM_EXPORT_COLUMNS } from './items.export';
import {
  hasMatchingImportHeader,
  ITEM_IMPORT_FIELDS,
  ITEM_IMPORT_MAX_ROWS,
  ITEM_IMPORT_TEMPLATE_DOWNLOAD_NAME,
  ITEM_IMPORT_TEMPLATE_FILE,
  parseImportRows,
  toImportErrorDetails,
  type ImportRowError,
  type ParsedItemImportRow,
} from './items.import';

interface ImportMasterData {
  unitIdByCode: Map<string, string>;
  supplierIdByCode: Map<string, string>;
  clientIdByCode: Map<string, string>;
  /** Cặp mã+phiên bản đã có trong DB (chưa xoá mềm), dạng `codeRevisionKey`. */
  existingCodeRevisions: Set<string>;
}

@Injectable()
export class ItemsService {
  private static readonly MAX_EXPORT_ROWS = 10_000;
  private static readonly DEFAULT_REVISION = 'R01';

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getItems(
    reqDto: GetItemsReqDto,
  ): Promise<OffsetPaginatedDto<PageItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(items.deletedAt),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.revision, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.type?.length ? inArray(items.type, reqDto.type) : undefined,
      reqDto.clientId ? eq(items.clientId, reqDto.clientId) : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status ? eq(items.status, reqDto.status) : undefined,
    );

    const [entities, [{ total }]] = await Promise.all([
      this.db.query.items.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(items.createdAt),
        with: {
          client: true,
          unit: true,
          supplier: true,
          creatorBy: true,
          imageFile: true,
        },
      }),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageItemResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Cắt im lặng ở `MAX_EXPORT_ROWS`, không báo lỗi khi vượt trần. Bộ lọc tách riêng khỏi
   * `getItems` dù trông giống nhau — hai route độc lập, sửa filter route nào chỉ route đó đổi. */
  async exportItems(reqDto: ExportItemsReqDto): Promise<StreamableFile> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(items.deletedAt),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.revision, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.type?.length ? inArray(items.type, reqDto.type) : undefined,
      reqDto.clientId ? eq(items.clientId, reqDto.clientId) : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status ? eq(items.status, reqDto.status) : undefined,
    );

    const rows = await this.db
      .select({
        code: items.code,
        revision: items.revision,
        name: items.name,
        type: items.type,
        status: items.status,
        unitName: units.name,
        clientName: clients.name,
        supplierName: suppliers.name,
        minStock: items.minStock,
        directGrade: items.directGrade,
        technicalStandard: items.technicalStandard,
        dimensions: items.dimensions,
        specificWeight: items.specificWeight,
        colorSurface: items.colorSurface,
        origin: items.origin,
        leadTime: items.leadTime,
        description: items.description,
        note: items.note,
        creatorName: users.fullName,
        createdAt: items.createdAt,
      })
      .from(items)
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(clients, eq(clients.id, items.clientId))
      .leftJoin(suppliers, eq(suppliers.id, items.supplierId))
      .leftJoin(users, eq(users.id, items.createdBy))
      .where(where)
      .orderBy(desc(items.createdAt))
      .limit(ItemsService.MAX_EXPORT_ROWS);

    const buffer = await buildXlsxBuffer('Hàng hoá', ITEM_EXPORT_COLUMNS, rows);
    const fileName = `hang-hoa-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.xlsx`;

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  async getItemOptions(
    reqDto: GetItemOptionsReqDto,
  ): Promise<ItemOptionResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const entities = await this.db.query.items.findMany({
      where: and(
        isNull(items.deletedAt),
        eq(items.status, ItemStatus.ACTIVE),
        keyword
          ? or(
              unaccentILike(items.code, keyword),
              unaccentILike(items.revision, keyword),
              unaccentILike(items.name, keyword),
            )
          : undefined,
        reqDto.type ? eq(items.type, reqDto.type) : undefined,
      ),
      // Alphabetical, because this list is rendered straight into a dropdown.
      orderBy: asc(items.name),
      // Trần cứng: `items` là dữ liệu người dùng tự tạo (thêm cả nhân bản qua `POST /:id/copy`),
      // không phải catalogue nhỏ cố định như units/countries.
      limit: 100,
    });

    return plainToInstance(ItemOptionResDto, entities, {
      excludeExtraneousValues: true,
    });
  }

  async getItem(itemId: string): Promise<ItemResDto> {
    const item = await this.db.query.items.findFirst({
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
      with: {
        client: true,
        unit: true,
        supplier: true,
        creatorBy: true,
        imageFile: true,
        clonedFrom: true,
        files: { with: { file: true } },
      },
    });

    if (!item) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ItemResDto, item, {
      excludeExtraneousValues: true,
    });
  }

  async createItem(reqDto: CreateItemReqDto, userId: string): Promise<void> {
    const type = reqDto.type ?? ItemType.FG;

    // Mã vật tư do người dùng tự đặt; chỉ FG mới tự sinh `SPxxxx` khi bỏ trống.
    if (type === ItemType.DIRECT && !reqDto.code) {
      throw new AppException(ErrorCode.E276, HttpStatus.BAD_REQUEST);
    }

    if (reqDto.code) {
      await this.validateCodeRevisionUniqueness(
        reqDto.code,
        reqDto.revision ?? ItemsService.DEFAULT_REVISION,
      );
    }

    await this.ensureUnitExists(reqDto.unitId);
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }
    await this.linkSuppliedFiles(reqDto);

    // `fileIds` sống ở bảng riêng `item_files` — tách khỏi phần spread thẳng vào `items`.
    const { fileIds, ...itemFields } = reqDto;

    try {
      await this.db.transaction(async (tx) => {
        const code = reqDto.code ?? (await this.generateItemCode(tx));

        // `type`/`status`/`minStock` đều có default ở cột schema, bỏ trống là DB tự điền.
        const [item] = await tx
          .insert(items)
          .values({
            ...itemFields,
            code,
            createdBy: userId,
          })
          .returning({ id: items.id });

        if (fileIds?.length) {
          await this.replaceFiles(tx, item.id, fileIds);
        }
      });
    } catch (error) {
      // Mã client tự gửi vẫn còn TOCTOU giữa `validateCodeUniqueness` và `INSERT` — bắt ở đây
      // thay vì để lỗi Postgres thô 500 lọt ra ngoài.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  /** File mẫu lưu sẵn trong repo (`templates/`), không sinh lại mỗi lần gọi. */
  async downloadImportTemplate(): Promise<StreamableFile> {
    const buffer = await readFile(
      join(__dirname, 'templates', ITEM_IMPORT_TEMPLATE_FILE),
    );

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${ITEM_IMPORT_TEMPLATE_DOWNLOAD_NAME}"`,
    });
  }

  /** Nhập vật tư (DIRECT) từ Excel — tất cả hoặc không: gom lỗi mọi dòng, chỉ ghi khi sạch lỗi. */
  async importItems(file: Express.Multer.File, userId: string): Promise<void> {
    const rows = await this.readImportRows(file);
    const { parsed, errors } = parseImportRows(rows);

    const masterData = await this.loadImportMasterData(parsed);
    const values = this.prepareItemsToCreate(
      parsed,
      masterData,
      userId,
      errors,
    );

    if (errors.length > 0) {
      throw new AppException(
        ErrorCode.E292,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `File có ${errors.length} lỗi, chưa có vật tư nào được nhập`,
        toImportErrorDetails(errors),
      );
    }

    await this.createItemsInBulk(values);
  }

  /** Tra id theo mã cho đơn vị / NCC / khách hàng và các cặp mã+phiên bản đã có — chỉ các mã xuất
   * hiện trong file, bỏ query khi không có mã nào để tra. */
  private async loadImportMasterData(
    parsed: ParsedItemImportRow[],
  ): Promise<ImportMasterData> {
    const distinct = (
      pick: (row: ParsedItemImportRow) => string | undefined,
    ) => [
      ...new Set(parsed.map(pick).filter((code): code is string => !!code)),
    ];
    const unitCodes = distinct((row) => row.unitCode);
    const supplierCodes = distinct((row) => row.supplierCode);
    const clientCodes = distinct((row) => row.clientCode);
    const itemCodes = distinct((row) => row.code);
    const noIds = Promise.resolve([] as { id: string; code: string }[]);

    const [unitRows, supplierRows, clientRows, existingRows] =
      await Promise.all([
        unitCodes.length
          ? this.db
              .select({ id: units.id, code: units.code })
              .from(units)
              .where(inArray(units.code, unitCodes))
          : noIds,
        supplierCodes.length
          ? this.db
              .select({ id: suppliers.id, code: suppliers.code })
              .from(suppliers)
              .where(
                and(
                  isNull(suppliers.deletedAt),
                  inArray(suppliers.code, supplierCodes),
                ),
              )
          : noIds,
        clientCodes.length
          ? this.db
              .select({ id: clients.id, code: clients.code })
              .from(clients)
              .where(
                and(
                  isNull(clients.deletedAt),
                  inArray(clients.code, clientCodes),
                ),
              )
          : noIds,
        itemCodes.length
          ? this.db
              .select({ code: items.code, revision: items.revision })
              .from(items)
              .where(
                and(isNull(items.deletedAt), inArray(items.code, itemCodes)),
              )
          : Promise.resolve([] as { code: string; revision: string }[]),
      ]);

    return {
      unitIdByCode: new Map(unitRows.map((row) => [row.code, row.id])),
      supplierIdByCode: new Map(supplierRows.map((row) => [row.code, row.id])),
      clientIdByCode: new Map(clientRows.map((row) => [row.code, row.id])),
      existingCodeRevisions: new Set(
        existingRows.map((row) => this.codeRevisionKey(row.code, row.revision)),
      ),
    };
  }

  /** Kiểm từng dòng với dữ liệu đã tra, đẩy lỗi vào `errors`, trả các dòng hợp lệ sẵn sàng insert. */
  private prepareItemsToCreate(
    parsed: ParsedItemImportRow[],
    masterData: ImportMasterData,
    userId: string,
    errors: ImportRowError[],
  ): (typeof items.$inferInsert)[] {
    const { unitIdByCode, supplierIdByCode, clientIdByCode } = masterData;
    const firstRowByCodeRevision = new Map<string, number>();
    const values: (typeof items.$inferInsert)[] = [];

    for (const row of parsed) {
      const unitId = unitIdByCode.get(row.unitCode);
      const supplierId = row.supplierCode
        ? supplierIdByCode.get(row.supplierCode)
        : undefined;
      const clientId = row.clientCode
        ? clientIdByCode.get(row.clientCode)
        : undefined;

      const errorCountBefore = errors.length;
      this.validateRowMasterData(row, { unitId, supplierId, clientId }, errors);
      this.validateRowCodeRevisionUnique(
        row,
        masterData,
        firstRowByCodeRevision,
        errors,
      );

      if (errors.length === errorCountBefore && unitId) {
        values.push(
          this.buildDirectItem(row, unitId, supplierId, clientId, userId),
        );
      }
    }

    return values;
  }

  /** Mã bắt buộc (đơn vị) hoặc đã điền (NCC, khách hàng) mà không tra ra id thì báo lỗi dòng. */
  private validateRowMasterData(
    row: ParsedItemImportRow,
    ids: { unitId?: string; supplierId?: string; clientId?: string },
    errors: ImportRowError[],
  ): void {
    const checks = [
      [row.unitCode, ids.unitId, 'Mã đơn vị tính'],
      [row.supplierCode, ids.supplierId, 'Mã nhà cung cấp'],
      [row.clientCode, ids.clientId, 'Mã khách hàng'],
    ] as const;

    for (const [code, id, header] of checks) {
      if (code && !id) {
        errors.push({
          rowNumber: row.rowNumber,
          header,
          code: 'not_found',
          message: 'Không tồn tại',
        });
      }
    }
  }

  /** Trùng mã+phiên bản với DB hoặc với dòng trước đó trong cùng file. */
  private validateRowCodeRevisionUnique(
    row: ParsedItemImportRow,
    masterData: ImportMasterData,
    firstRowByCodeRevision: Map<string, number>,
    errors: ImportRowError[],
  ): void {
    const key = this.codeRevisionKey(
      row.code,
      row.revision ?? ItemsService.DEFAULT_REVISION,
    );
    const firstRow = firstRowByCodeRevision.get(key);

    let message: string | undefined;
    if (masterData.existingCodeRevisions.has(key)) {
      message = 'Mã vật tư và phiên bản đã tồn tại trong hệ thống';
    } else if (firstRow !== undefined) {
      message = `Trùng mã vật tư và phiên bản với dòng ${firstRow}`;
    } else {
      firstRowByCodeRevision.set(key, row.rowNumber);
    }

    if (message) {
      errors.push({
        rowNumber: row.rowNumber,
        header: 'Mã vật tư',
        code: 'duplicate',
        message,
      });
    }
  }

  /** `status`/`minStock`/`revision` bỏ trống thì DB tự điền default ở cột. */
  private buildDirectItem(
    row: ParsedItemImportRow,
    unitId: string,
    supplierId: string | undefined,
    clientId: string | undefined,
    userId: string,
  ): typeof items.$inferInsert {
    return {
      code: row.code,
      revision: row.revision,
      name: row.name,
      type: ItemType.DIRECT,
      unitId,
      supplierId,
      clientId,
      minStock: row.minStock,
      specificWeight: row.specificWeight,
      directGrade: row.directGrade,
      technicalStandard: row.technicalStandard,
      dimensions: row.dimensions,
      colorSurface: row.colorSurface,
      origin: row.origin,
      leadTime: row.leadTime,
      description: row.description,
      note: row.note,
      createdBy: userId,
    };
  }

  private async createItemsInBulk(
    values: (typeof items.$inferInsert)[],
  ): Promise<void> {
    try {
      await this.db.insert(items).values(values);
    } catch (error) {
      // Race với `POST /items` cùng lúc giữa lần kiểm trùng và `INSERT`.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  private codeRevisionKey(code: string, revision: string): string {
    return `${code}\u0000${revision}`;
  }

  private async readImportRows(file: Express.Multer.File) {
    const invalid = (message: string) =>
      new AppException(ErrorCode.E291, HttpStatus.BAD_REQUEST, message);

    if (!file) throw invalid('Thiếu file Excel');

    let rows: Awaited<ReturnType<typeof readXlsxRows>>;
    try {
      rows = await readXlsxRows(file.buffer, ITEM_IMPORT_FIELDS.length);
    } catch {
      throw invalid('Không đọc được file Excel');
    }

    const [header, ...dataRows] = rows;
    if (!header || !hasMatchingImportHeader(header.cells)) {
      throw invalid('Tiêu đề cột không khớp file mẫu, hãy tải lại file mẫu');
    }
    if (dataRows.length === 0) throw invalid('File không có dòng dữ liệu');
    if (dataRows.length > ITEM_IMPORT_MAX_ROWS) {
      throw invalid(`Tối đa ${ITEM_IMPORT_MAX_ROWS} dòng mỗi lần nhập`);
    }

    return dataRows;
  }

  async updateItem(itemId: string, reqDto: UpdateItemReqDto): Promise<void> {
    const existing = await this.ensureItemExists(itemId);

    if (reqDto.code !== undefined || reqDto.revision !== undefined) {
      await this.validateCodeRevisionUniqueness(
        reqDto.code ?? existing.code,
        reqDto.revision ?? existing.revision,
        itemId,
      );
    }
    if (reqDto.unitId) {
      await this.ensureUnitExists(reqDto.unitId);
    }
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.supplierId) {
      await this.ensureSupplierExists(reqDto.supplierId);
    }
    await this.linkSuppliedFiles(reqDto);

    const { fileIds, ...itemFields } = reqDto;

    try {
      await this.db.transaction(async (tx) => {
        // `updated_at` is bumped by the column's own `$onUpdate`. Skip the `UPDATE` entirely when a
        // request only sends `fileIds` — `UpdateItemReqDto`'s declared-but-unset fields still show
        // up as own keys (`undefined`) at runtime, so `Object.keys` alone can't tell "nothing sent"
        // from "every other field sent"; checking for a defined value avoids drizzle's "No values
        // to set".
        if (Object.values(itemFields).some((value) => value !== undefined)) {
          await tx.update(items).set(itemFields).where(eq(items.id, itemId));
        }

        if (fileIds) {
          await this.replaceFiles(tx, itemId, fileIds);
        }
      });
    } catch (error) {
      // Cùng backstop TOCTOU với `createItem` — trùng cặp `(code, revision)` sinh ra giữa lúc
      // kiểm tra và lúc `UPDATE` thật sự chạy.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.ensureItemExists(itemId);
    await this.ensureItemNotInUse(itemId);

    await this.db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, itemId));
  }

  /** Chặn xoá khi item đã gắn Đơn hàng hoặc Lệnh sản xuất — không chặn theo BOM (component của
   * item khác vẫn xoá được, xoá mềm không phá cấu trúc BOM đã có). */
  private async ensureItemNotInUse(itemId: string): Promise<void> {
    const referencingTables = [
      orderItems,
      productionOrderItems,
      productionJobs,
    ];

    const references = await Promise.all(
      referencingTables.map((table) =>
        this.db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.itemId, itemId))
          .limit(1),
      ),
    );

    if (references.some((rows) => rows.length > 0)) {
      throw new AppException(ErrorCode.E255, HttpStatus.CONFLICT);
    }
  }

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkSuppliedFiles(
    reqDto: CreateItemReqDto | UpdateItemReqDto,
  ): Promise<void> {
    const fileIds = [reqDto.imageFileId, ...(reqDto.fileIds ?? [])].filter(
      (id): id is string => Boolean(id),
    );

    await this.filesService.linkFiles(fileIds);
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceFiles(
    tx: DbTransaction,
    itemId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx.delete(itemFiles).where(eq(itemFiles.itemId, itemId));

    if (fileIds.length) {
      await tx
        .insert(itemFiles)
        .values(fileIds.map((fileId) => ({ itemId, fileId })));
    }
  }

  /** "Thành phần vật tư" — báo cáo phái sinh chỉ-đọc, KHÁC `getBom` (cây thật, `quantity` thô so
   * cha trực tiếp): ở đây `requiredQty` là định mức đã nổ cấp (nhân luỹ kế qua chuỗi node cha, seed
   * = 1 tại gốc) và gộp theo `itemId` — cùng tên, cùng khái niệm với
   * `ProductionJobIssueResDto.requiredQty` (seed = SL Job), xem "Chuẩn nổ cấp BOM" ở
   * `docs/domains/product-structure.md`. Cây BOM nhỏ nên dựng multiplier + gộp trong bộ nhớ (cùng
   * tiền lệ `copyBomTree`), phân trang cũng áp trên mảng đã gộp — không còn phân trang bằng SQL
   * trên `bom_items`. */
  async getItemIssues(
    itemId: string,
    reqDto: GetItemIssuesReqDto,
  ): Promise<OffsetPaginatedDto<ItemIssueResDto>> {
    await this.ensureItemExists(itemId);

    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    if (!bom) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const tree = await this.db
      .select({
        id: bomItems.id,
        parentId: bomItems.parentId,
        itemId: bomItems.itemId,
        quantity: bomItems.quantity,
        type: bomItems.type,
      })
      .from(bomItems)
      .where(eq(bomItems.bomId, bom.id))
      .orderBy(asc(bomItems.level), asc(bomItems.sortOrder));

    // multiplier[node] = multiplier[cha] × quantity node, gốc (parentId null) = 1 × quantity —
    // đi từ gốc xuống đúng N tầng COMPONENT rồi dừng ở DIRECT, không cần xử lý DIRECT có con (bất biến `E052`).
    // Làm tròn scale 6 ngay mỗi bước nhân (không chỉ lúc gộp cuối) — khác `createJobBomItems`/
    // `createJobIssues` phía Job, số ở đây không đi qua cột `numeric(18,6)` nào để Postgres tự làm
    // tròn hộ giữa các cấp, nên tự làm tròn để tránh rác dấu phẩy động lọt ra JSON (cùng idiom
    // `IqcService.validateDecision`'s `scale`).
    const multiplierById = new Map<string, number>();
    const totalByItemId = new Map<string, number>();

    for (const node of tree) {
      const parentMultiplier = node.parentId
        ? multiplierById.get(node.parentId)!
        : 1;
      const multiplier =
        Math.round(parentMultiplier * node.quantity * 1e6) / 1e6;
      multiplierById.set(node.id, multiplier);

      if (node.type === BomType.DIRECT) {
        // Lá DIRECT luôn trỏ item (`chk_bom_items_node_shape`).
        const directItemId = node.itemId!;
        const total =
          Math.round(
            ((totalByItemId.get(directItemId) ?? 0) + multiplier) * 1e6,
          ) / 1e6;
        totalByItemId.set(directItemId, total);
      }
    }

    if (!totalByItemId.size) {
      return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const itemRows = await this.db
      .select({
        itemId: items.id,
        code: items.code,
        revision: items.revision,
        name: items.name,
        unit: getTableColumns(units),
        image: getTableColumns(files),
      })
      .from(items)
      .innerJoin(units, eq(items.unitId, units.id))
      .leftJoin(files, eq(items.imageFileId, files.id))
      .where(
        and(
          inArray(items.id, [...totalByItemId.keys()]),
          keyword
            ? or(
                unaccentILike(items.code, keyword),
                unaccentILike(items.revision, keyword),
                unaccentILike(items.name, keyword),
              )
            : undefined,
        ),
      )
      .orderBy(asc(items.code));

    const issues = itemRows.map((row) => ({
      ...row,
      requiredQty: totalByItemId.get(row.itemId)!,
    }));

    const paged = issues.slice(reqDto.offset, reqDto.offset + reqDto.limit);

    return new OffsetPaginatedDto(
      plainToInstance(ItemIssueResDto, paged, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(issues.length, reqDto),
    );
  }

  /** Clone một item. FG: giữ nguyên `code`, mang `revision` người dùng nhập, nhân bản cả cây BOM.
   * DIRECT: "tạo vật tư tương tự" — `code` mới bắt buộc (`E276`), `revision` giữ mặc định,
   * `name` tuỳ chọn, không có BOM. Cả hai giữ `clonedFromItemId` và `item_files`. */
  async copyItem(
    itemId: string,
    reqDto: CopyItemReqDto,
    userId: string,
  ): Promise<void> {
    const item = await this.ensureItemExists(itemId);
    const { code, name, revision } = this.resolveCopyIdentity(item, reqDto);

    await this.validateCodeRevisionUniqueness(code, revision);

    // 1. Đọc BOM + tài liệu đính kèm gốc trước khi mở transaction (vật tư không có BOM → null)
    const bomStructure = await this.getBomStructureToCopy(itemId);

    const itemFilesToCopy = await this.db
      .select({ fileId: itemFiles.fileId })
      .from(itemFiles)
      .where(eq(itemFiles.itemId, itemId));

    // 2. Mở transaction để ghi dữ liệu mới
    try {
      await this.db.transaction(async (tx) => {
        const {
          id: clonedFromItemId,
          revision: _revision,
          createdAt,
          updatedAt,
          deletedAt,
          createdBy,
          ...copyFields
        } = item;

        const [createdItem] = await tx
          .insert(items)
          .values({
            ...copyFields,
            code,
            name,
            revision,
            clonedFromItemId,
            createdBy: userId,
          })
          .returning({ id: items.id });

        if (bomStructure) {
          await this.copyBomTree(tx, createdItem.id, bomStructure, userId);
        }

        if (itemFilesToCopy.length) {
          await this.replaceFiles(
            tx,
            createdItem.id,
            itemFilesToCopy.map((row) => row.fileId),
          );
        }
      });
    } catch (error) {
      // Cùng backstop TOCTOU với `createItem`/`updateItem` — trùng cặp `(code, revision)` sinh ra
      // giữa lúc kiểm tra và lúc `INSERT` thật sự chạy.
      if (extractPostgresError(error)?.code === '23505') {
        throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  private resolveCopyIdentity(
    item: ItemSelect,
    reqDto: CopyItemReqDto,
  ): ItemCopyIdentity {
    if (item.type === ItemType.DIRECT) {
      if (!reqDto.code) {
        throw new AppException(ErrorCode.E276, HttpStatus.BAD_REQUEST);
      }
      return {
        code: reqDto.code,
        name: reqDto.name ?? item.name,
        revision: ItemsService.DEFAULT_REVISION,
      };
    }

    if (!reqDto.revision) {
      throw new AppException(ErrorCode.E277, HttpStatus.BAD_REQUEST);
    }
    return {
      code: item.code,
      name: item.name,
      revision: reqDto.revision,
    };
  }

  private async getBomStructureToCopy(
    itemId: string,
  ): Promise<ItemBomStructure | null> {
    const [bom] = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.itemId, itemId))
      .limit(1);

    if (!bom) return null;

    const bomItemsToCopy = await this.db.query.bomItems.findMany({
      where: eq(bomItems.bomId, bom.id),
      orderBy: [asc(bomItems.level), asc(bomItems.sortOrder)],
    });

    return { bom, bomItems: bomItemsToCopy };
  }

  /** Nhân bản cây `bom_items` + công đoạn as-used (`bom_operations`) của từng node COMPONENT, cộng
   * công đoạn Cấp 0 (`routing_operations`, neo `bomId` — không phải một node `bom_items`, xem
   * `docs/decisions/routing-operations-table.md`) — bảng riêng nên copy 2 bước độc lập. */
  private async copyBomTree(
    tx: DbTransaction,
    itemId: string,
    bomStructure: ItemBomStructure,
    userId: string,
  ): Promise<void> {
    const [newBom] = await tx
      .insert(boms)
      .values({ itemId, createdBy: userId })
      .returning({ id: boms.id });

    const newIdByOldId = new Map<string, string>();

    const newItems = bomStructure.bomItems.map(
      ({
        id: oldId,
        parentId: oldParentId,
        bomId: _bomId,
        createdAt,
        updatedAt,
        ...node
      }) => {
        const id = crypto.randomUUID();
        newIdByOldId.set(oldId, id);

        return {
          ...node,
          id,
          bomId: newBom.id,
          parentId: oldParentId
            ? (newIdByOldId.get(oldParentId) ?? null)
            : null,
          createdBy: userId,
        };
      },
    );

    if (newItems.length) {
      await tx.insert(bomItems).values(newItems);

      const sourceOperations = await tx.query.bomOperations.findMany({
        where: inArray(bomOperations.bomItemId, [...newIdByOldId.keys()]),
      });
      if (sourceOperations.length) {
        await tx.insert(bomOperations).values(
          sourceOperations.map(
            ({ id, createdAt, updatedAt, ...operation }) => ({
              ...operation,
              bomItemId: newIdByOldId.get(operation.bomItemId)!,
              createdBy: userId,
            }),
          ),
        );
      }
    }

    const sourceRoutingOperations = await tx.query.routingOperations.findMany({
      where: eq(routingOperations.bomId, bomStructure.bom.id),
    });
    if (sourceRoutingOperations.length) {
      await tx.insert(routingOperations).values(
        sourceRoutingOperations.map(
          ({ id, createdAt, updatedAt, ...operation }) => ({
            ...operation,
            bomId: newBom.id,
            createdBy: userId,
          }),
        ),
      );
    }
  }

  private async ensureItemExists(itemId: string) {
    const existing = await this.db.query.items.findFirst({
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async validateCodeRevisionUniqueness(
    code: string,
    revision: string,
    ignoredItemId?: string,
  ): Promise<void> {
    const where = and(
      eq(items.code, code),
      eq(items.revision, revision),
      isNull(items.deletedAt),
      ignoredItemId ? ne(items.id, ignoredItemId) : undefined,
    );

    const existing = await this.db.query.items.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E008, HttpStatus.CONFLICT);
    }
  }

  private async ensureUnitExists(unitId: string): Promise<void> {
    const existing = await this.db.query.units.findFirst({
      columns: { id: true },
      where: eq(units.id, unitId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E011, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /** Chỉ FG tự sinh mã `SPxxxx` — vật tư luôn do người dùng nhập (`E276` nếu thiếu). */
  private async generateItemCode(tx: DbTransaction): Promise<string> {
    const sequence = await generateDocumentSequence(tx, DocumentType.ITEM_FG);

    return `SP${String(sequence).padStart(4, '0')}`;
  }
}
