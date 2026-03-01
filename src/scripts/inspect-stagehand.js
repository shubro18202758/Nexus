
const pkg = require("@browserbasehq/stagehand");
console.log("Keys:", Object.keys(pkg));
console.log("Stagehand:", pkg.Stagehand);
console.log("Typeof Stagehand:", typeof pkg.Stagehand);
console.log("Default:", pkg.default);
if (pkg.default) {
    console.log("Keys of Default:", Object.keys(pkg.default));
    console.log("Typeof Default:", typeof pkg.default);
}

try {
    const s = new pkg.Stagehand({ env: "LOCAL", verbose: 1, enableVision: false });
    console.log("Instance created successfully.");
    console.log("Available Models JSON:", JSON.stringify(pkg.AVAILABLE_CUA_MODELS));
    console.log("Model Map JSON:", JSON.stringify(pkg.modelToAgentProviderMap));
    process.exit(0);
} catch (e) {
    console.log("Error creating instance from Named Export:", e.message);
}

try {
    const s = new pkg.default({ env: "LOCAL", verbose: 1, enableVision: false });
    console.log("Instance created successfully from Default.");
} catch (e) {
    console.log("Error creating instance from Default:", e.message);
}
