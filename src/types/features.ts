declare const featureNameBrand: unique symbol;

export type FeatureName = string & { readonly [featureNameBrand]: true };

export function toFeatureName(raw: string): FeatureName {
  const normalized = raw.startsWith('features-') ? raw : `features-${raw}`;
  return normalized as FeatureName;
}

export function stripFeaturePrefix(name: FeatureName): string {
  return (name as string).replace(/^features-/, '');
}

export interface Feature {
  readonly name: FeatureName;
  readonly kbPath: string;
  readonly skillPath: string;
  readonly hasSkill: boolean;
}
