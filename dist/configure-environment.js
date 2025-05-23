"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("./github");
const utils_1 = require("./utils");
async function run() {
    try {
        const action = core.getInput('action', { required: true });
        const environmentName = core.getInput('environment_name', { required: true });
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error('GITHUB_TOKEN is required');
        }
        const repository = process.env.GITHUB_REPOSITORY;
        if (!repository) {
            throw new Error('GITHUB_REPOSITORY is required');
        }
        const github = new github_1.GitHubService(token, repository);
        // Handle get action
        if (action.toLowerCase() === 'get') {
            try {
                const config = await github.getEnvironmentConfig(environmentName);
                core.setOutput('status', 'success');
                core.setOutput('message', `Successfully retrieved environment '${environmentName}'`);
                core.setOutput('environment', JSON.stringify(config));
                return;
            }
            catch (error) {
                if (error instanceof Error && error.message.includes('Not Found')) {
                    core.setOutput('status', 'nochange');
                    core.setOutput('message', `Environment '${environmentName}' does not exist`);
                    core.setOutput('environment', '{}');
                    return;
                }
                throw error;
            }
        }
        // Handle delete action separately
        if (action.toLowerCase() === 'delete') {
            const result = await github.deleteAnEnvironment(environmentName);
            core.setOutput('status', result.status);
            core.setOutput('message', result.message);
            return;
        }
        // Only process configuration for create/update actions
        const reviewers = core.getInput('reviewers');
        const waitTimer = core.getInput('wait_timer');
        const preventSelfReview = core.getInput('prevent_self_review');
        const deploymentBranchPolicy = core.getInput('deployment_branch_policy');
        const processedReviewers = reviewers ? await (0, utils_1.processReviewers)(reviewers, github) : undefined;
        const config = {
            wait_timer: waitTimer ? parseInt(waitTimer, 10) : undefined,
            reviewers: processedReviewers,
            prevent_self_review: preventSelfReview ? preventSelfReview === 'true' : undefined,
            deployment_branch_policy: deploymentBranchPolicy ? JSON.parse(deploymentBranchPolicy) : undefined
        };
        const result = await github.updateEnvironment(environmentName, config);
        core.setOutput('status', result.status);
        core.setOutput('message', result.message);
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed('An unknown error occurred');
        }
    }
}
exports.run = run;
run();
//# sourceMappingURL=configure-environment.js.map