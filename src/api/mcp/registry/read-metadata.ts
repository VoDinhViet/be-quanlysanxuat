/** `Reflect.getMetadata` trả `any`; bọc lại để chỗ gọi khai kiểu mong đợi một lần. */
export function readMetadata<TValue>(
  metadataKey: string,
  target: object,
  propertyKey?: string,
): TValue | undefined {
  const value: unknown =
    propertyKey === undefined
      ? Reflect.getMetadata(metadataKey, target)
      : Reflect.getMetadata(metadataKey, target, propertyKey);

  return value as TValue | undefined;
}

/** Lấy method của controller theo tên mà không phải đọc qua `prototype: any`. */
export function readPrototypeMember(
  controller: { prototype: object },
  memberName: string,
): unknown {
  return (controller.prototype as Record<string, unknown>)[memberName];
}
