import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import puppeteer, { Browser } from 'puppeteer';

import { ErrorCode } from '../constants/error-code.constant';
import { AppException } from '../exceptions/app.exception';
import {
  FormTemplateType,
  getFormTemplatePath,
} from './form-templates.registry';

@Injectable()
export class PdfRendererService implements OnModuleInit, OnModuleDestroy {
  private static readonly PDF_OPTIONS = {
    format: 'A4' as const,
    landscape: true,
    printBackground: true,
  };

  private readonly logger = new Logger(PdfRendererService.name);
  private readonly compiledTemplates = new Map<
    FormTemplateType,
    Handlebars.TemplateDelegate
  >();
  private browser: Browser | undefined;

  async onModuleInit(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
  }

  async render(type: FormTemplateType, context: object): Promise<Buffer> {
    const html = this.compile(type)(context);

    try {
      return await this.renderPdf(html);
    } catch {
      // Chromium có thể đã crash giữa chừng — thử khởi động lại browser 1 lần rồi render lại,
      // tránh app đứng render PDF vĩnh viễn sau 1 lần crash.
      this.logger.warn(
        'Puppeteer render PDF thất bại, thử khởi động lại browser',
      );
      await this.browser?.close().catch(() => undefined);
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        return await this.renderPdf(html);
      } catch {
        throw new AppException(
          ErrorCode.E274,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  private async renderPdf(html: string): Promise<Buffer> {
    if (!this.browser) {
      throw new AppException(ErrorCode.E274, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const page = await this.browser.newPage();
    try {
      // Puppeteer 25 bỏ `networkidle0`/`networkidle2` khỏi `setContent` — `load` đã đợi xong
      // stylesheet/font ngoài (Google Fonts), thêm `document.fonts.ready` để chắc chắn.
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf(PdfRendererService.PDF_OPTIONS);
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  private compile(type: FormTemplateType): Handlebars.TemplateDelegate {
    const cached = this.compiledTemplates.get(type);
    if (cached) return cached;

    const source = readFileSync(getFormTemplatePath(type), 'utf-8');
    const compiled = Handlebars.compile(source);
    this.compiledTemplates.set(type, compiled);
    return compiled;
  }
}
