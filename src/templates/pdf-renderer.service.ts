import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { join } from 'path';
import puppeteer, { Browser } from 'puppeteer';

import { ErrorCode } from '../constants/error-code.constant';
import { AppException } from '../exceptions/app.exception';
import {
  FORM_TEMPLATES,
  FormTemplateType,
  getFormTemplatePath,
} from './form-templates.registry';

@Injectable()
export class PdfRendererService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private readonly compiledTemplates = new Map<
    FormTemplateType,
    Handlebars.TemplateDelegate
  >();
  private browser: Browser | undefined;

  async onModuleInit(): Promise<void> {
    const partialsDir = join(__dirname, 'partials');
    for (const partialFileName of readdirSync(partialsDir)) {
      Handlebars.registerPartial(
        partialFileName.replace('.html', ''),
        readFileSync(join(partialsDir, partialFileName), 'utf-8'),
      );
    }
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
    const { landscape, formCode, pageLabel } = FORM_TEMPLATES[type];

    try {
      return await this.renderPdf(html, landscape, formCode, pageLabel);
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
        return await this.renderPdf(html, landscape, formCode, pageLabel);
      } catch {
        throw new AppException(
          ErrorCode.E274,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  private async renderPdf(
    html: string,
    landscape: boolean,
    formCode: string,
    pageLabel: string | undefined,
  ): Promise<Buffer> {
    if (!this.browser) {
      throw new AppException(ErrorCode.E274, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const page = await this.browser.newPage();
    try {
      // Puppeteer 25 bỏ `networkidle0`/`networkidle2` khỏi `setContent` — `load` đã đợi xong
      // stylesheet/font ngoài (Google Fonts), thêm `document.fonts.ready` để chắc chắn.
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf({
        format: 'A4',
        landscape,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: this.buildFooterTemplate(formCode, pageLabel),
        margin: { top: '8mm', right: '10mm', bottom: '12mm', left: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /** Chân trang do Chromium vẽ lại ở mọi trang nên `totalPages` đúng với bảng dài nhiều trang;
   * font phải khai báo inline vì chân trang không đọc CSS của template. */
  private buildFooterTemplate(
    formCode: string,
    pageLabel: string | undefined,
  ): string {
    const pageLabelPrefix = pageLabel ? `${pageLabel} ` : '';
    const footerFormCode = pageLabel ? '' : formCode;
    return `<div style="width:100%;padding:0 10mm;font-family:'Times New Roman',Tinos,serif;font-size:9px;display:flex;">
      <span style="flex:1;"></span>
      <span style="flex:1;text-align:center;">${pageLabelPrefix}<span class="pageNumber"></span>/<span class="totalPages"></span></span>
      <span style="flex:1;text-align:right;">${footerFormCode}</span>
    </div>`;
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
