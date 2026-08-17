const omittedDependencies = new Set(
  (process.env.npm_config_omit ?? "").split(/\s+/).filter(Boolean),
);
const isProductionInstall =
  process.env.NODE_ENV === "production" ||
  process.env.npm_config_production === "true" ||
  omittedDependencies.has("dev");

if (!isProductionInstall) {
  const { default: husky } = await import("husky");
  const message = husky();

  if (message) {
    console.log(message);
  }
}
