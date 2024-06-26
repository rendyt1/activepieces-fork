export type CreateSkuParams = {
  Id?: number;
  ProductId: number;
  IsActive?: boolean;
  ActivateIfPossible?: boolean;
  Name: string;
  RefId?: string;
  Ean?: string;
  PackagedHeight: number;
  PackagedLength: number;
  PackagedWidth: number;
  PackagedWeightKg: number;
  Height?: number;
  Length?: number;
  Width?: number;
  WeightKg?: number;
  CubicWeight?: number;
  IsKit?: boolean;
  CreationDate?: string;
  RewardValue?: number;
  EstimatedDateArrival?: string;
  ManufacturerCode?: string;
  CommercialConditionId?: number;
  MeasurementUnit?: string;
  UnitMultiplier?: number;
  ModalType?: string;
  KitItemsSellApart?: boolean;
  Videos?: string[];
};

export type UpdateSkuParams = CreateSkuParams;
