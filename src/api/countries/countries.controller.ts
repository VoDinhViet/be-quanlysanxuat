import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { ApiPublic } from '../../decorators/http.decorators';
import { CountriesService } from './countries.service';
import { CountryResDto } from './dto/country.res.dto';
import { GetCountriesReqDto } from './dto/get-countries.req.dto';

@ApiTags('Countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiPublic({
    type: CountryResDto,
    summary: 'List countries',
    isPaginated: true,
  })
  getCountries(@Query() reqDto: GetCountriesReqDto): Promise<OffsetPaginatedDto<CountryResDto>> {
    return this.countriesService.getCountries(reqDto);
  }
}
