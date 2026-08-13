import { Module } from "@nestjs/common";
import { DirectorOperativoModule } from "./director/director.module";
import { DespachoModule } from "./despacho/despacho.module";
import { CampoModule } from "./campo/campo.module";

@Module({
  imports: [DirectorOperativoModule, DespachoModule, CampoModule],
  exports: [DirectorOperativoModule, DespachoModule, CampoModule],
})
export class OperacionesModule {}
