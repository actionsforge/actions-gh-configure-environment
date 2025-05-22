import * as core from '@actions/core';
import { GitHubService } from './github';
import { processReviewers } from './utils';

export async function run(): Promise<void> {
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

    const github = new GitHubService(token, repository);

    // Handle get action
    if (action.toLowerCase() === 'get') {
      try {
        const config = await github.getEnvironmentConfig(environmentName);
        core.setOutput('status', 'success');
        core.setOutput('message', `Successfully retrieved environment '${environmentName}'`);
        core.setOutput('environment', JSON.stringify(config));
        return;
      } catch (error) {
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

    const processedReviewers = reviewers ? await processReviewers(reviewers, github) : undefined;
    const config = {
      wait_timer: waitTimer ? parseInt(waitTimer, 10) : undefined,
      reviewers: processedReviewers,
      prevent_self_review: preventSelfReview ? preventSelfReview === 'true' : undefined,
      deployment_branch_policy: deploymentBranchPolicy ? JSON.parse(deploymentBranchPolicy) : undefined
    };

    const result = await github.updateEnvironment(environmentName, config);
    core.setOutput('status', result.status);
    core.setOutput('message', result.message);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
