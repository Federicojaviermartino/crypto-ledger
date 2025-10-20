import { Controller, Get, Post, Body, Param, Query, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';

/**
 * Controller for invoice operations
 */
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(@Body() data: any) {
    return this.invoicesService.create(data);
  }

  @Get()
  async findAll(
    @Query('direction') direction?: string,
    @Query('siiStatus') siiStatus?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.invoicesService.findAll({
      direction,
      siiStatus,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/facturae')
  async generateFacturae(
    @Param('id') id: string,
    @Body() body: { sign?: boolean },
  ) {
    return this.invoicesService.generateFacturae(id, body.sign);
  }

  @Get(':id/facturae.xml')
  async downloadFacturae(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id);

    if (!invoice.facturaeXml) {
      throw new NotFoundException('Facturae XML not generated yet');
    }

    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="facturae_${invoice.invoiceNumber}.xml"`,
    });

    res.send(invoice.facturaeXml);
  }

  @Post(':id/sii/submit')
  async submitToSii(
    @Param('id') id: string,
    @Body() body: { type?: 'issued' | 'received' },
  ) {
    return this.invoicesService.submitToSii(id, body.type || 'issued');
  }

  @Get(':id/sii/status')
  async getSiiStatus(@Param('id') id: string) {
    return this.invoicesService.getSiiStatus(id);
  }

  @Get('sii/overdue')
  async getOverdueSubmissions() {
    return this.invoicesService.checkOverdueSubmissions();
  }

  @Post(':id/peppol')
  async generatePeppol(@Param('id') id: string) {
    return this.invoicesService.generatePeppol(id);
  }

  @Get(':id/peppol.xml')
  async downloadPeppol(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id);
    
    if (!invoice.ublXml) {
      throw new NotFoundException('Peppol UBL not generated yet');
    }

    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="peppol_${invoice.invoiceNumber}.xml"`,
    });

    res.send(invoice.ublXml);
  }
}
