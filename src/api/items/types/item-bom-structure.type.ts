import type { BomItemSelect } from '../../../database/schemas';

export type ItemBomStructure = {
  bom: { id: string };
  bomItems: BomItemSelect[];
};
