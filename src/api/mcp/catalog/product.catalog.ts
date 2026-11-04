import { BomDirectsController } from '../../bom-directs/bom-directs.controller';
import { BomOperationsController } from '../../bom-operations/bom-operations.controller';
import { BomsController } from '../../boms/boms.controller';
import { ItemCategoriesController } from '../../item-categories/item-categories.controller';
import { ItemUnitsController } from '../../item-units/item-units.controller';
import { ItemsController } from '../../items/items.controller';
import { OperationsController } from '../../operations/operations.controller';
import { RoutingsController } from '../../routings/routings.controller';
import { UnitsController } from '../../units/units.controller';
import { defineMcpTool } from './define-mcp-tool';

export const PRODUCT_TOOLS = [
  defineMcpTool({
    name: 'product_item_list',
    title: 'Danh sách mã hàng',
    hint: 'Items (finished goods FG and materials DIRECT) by code or name, type, customer, supplier or category; use it to get an itemId',
    controller: ItemsController,
    method: 'getItems',
  }),
  defineMcpTool({
    name: 'product_item_get',
    title: 'Chi tiết mã hàng',
    hint: 'One item by itemId, with revision, unit, category and status',
    controller: ItemsController,
    method: 'getItem',
  }),
  defineMcpTool({
    name: 'product_item_material_demand_list',
    title: 'Nhu cầu vật tư trực tiếp của mã hàng',
    hint: 'Exploded direct-material demand of one item by itemId',
    controller: ItemsController,
    method: 'getItemIssues',
  }),
  defineMcpTool({
    name: 'product_item_unit_list',
    title: 'Đơn vị phụ của mã hàng',
    hint: 'Secondary units of one item and their conversion factors, by itemId',
    controller: ItemUnitsController,
    method: 'getItemUnits',
  }),
  defineMcpTool({
    name: 'product_bom_get',
    title: 'Cấu trúc sản phẩm (BOM)',
    hint: 'BOM structure tree of one item by itemId',
    controller: BomsController,
    method: 'getBomItem',
  }),
  defineMcpTool({
    name: 'product_bom_material_list',
    title: 'Vật tư gắn trực tiếp vào một nút BOM',
    hint: 'Materials (DIRECT) attached to one BOM node, by itemId and bomItemId',
    controller: BomDirectsController,
    method: 'getDirects',
  }),
  defineMcpTool({
    name: 'product_bom_operation_list',
    title: 'Công đoạn của một nút BOM',
    hint: 'Operations attached to one BOM node, by itemId and bomItemId',
    controller: BomOperationsController,
    method: 'getOperations',
  }),
  defineMcpTool({
    name: 'product_routing_list',
    title: 'Quy trình công đoạn của mã hàng',
    hint: 'Operation routing of one item by itemId, in execution order',
    controller: RoutingsController,
    method: 'getOperations',
  }),
  defineMcpTool({
    name: 'product_operation_list',
    title: 'Danh sách công đoạn',
    hint: 'Operation catalogue, searchable by name',
    controller: OperationsController,
    method: 'getOperations',
  }),
  defineMcpTool({
    name: 'product_operation_get',
    title: 'Chi tiết công đoạn',
    hint: 'One operation by operationId',
    controller: OperationsController,
    method: 'getOperation',
  }),
  defineMcpTool({
    name: 'product_operation_assignment_list',
    title: 'Nhân sự được phân công công đoạn',
    hint: 'Employees assigned to one operation, by operationId',
    controller: OperationsController,
    method: 'getOperationAssignments',
  }),
  defineMcpTool({
    name: 'product_item_category_list',
    title: 'Danh sách nhóm vật tư',
    hint: 'Item categories, for filtering product_item_list by itemCategoryId',
    controller: ItemCategoriesController,
    method: 'getItemCategories',
  }),
  defineMcpTool({
    name: 'product_item_category_get',
    title: 'Chi tiết nhóm vật tư',
    hint: 'One item category by itemCategoryId',
    controller: ItemCategoriesController,
    method: 'getItemCategory',
  }),
  defineMcpTool({
    name: 'product_unit_list',
    title: 'Danh sách đơn vị tính',
    hint: 'Units of measure',
    controller: UnitsController,
    method: 'getUnits',
  }),
  defineMcpTool({
    name: 'product_unit_get',
    title: 'Chi tiết đơn vị tính',
    hint: 'One unit of measure by unitId',
    controller: UnitsController,
    method: 'getUnit',
  }),
];
