import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as core from '@actions/core';
import * as github from '../github';
import { run } from '../configure-environment';
import { EnvironmentConfig } from '../types';
import * as utils from '../utils';

vi.mock('@actions/core');
vi.mock('../github');
vi.mock('../utils');

describe('configure-environment', () => {
  let mockOctokit: {
    repos: {
      getEnvironment: ReturnType<typeof vi.fn>;
      deleteAnEnvironment: ReturnType<typeof vi.fn>;
      createOrUpdateEnvironment: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = {
      repos: {
        getEnvironment: vi.fn(),
        deleteAnEnvironment: vi.fn(),
        createOrUpdateEnvironment: vi.fn()
      }
    };
    (github.GitHubService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getEnvironmentConfig: (envName: string) => mockOctokit.repos.getEnvironment({
        owner: 'owner',
        repo: 'repo',
        environment_name: envName
      }),
      deleteAnEnvironment: async (envName: string) => {
        try {
          await mockOctokit.repos.getEnvironment({
            owner: 'owner',
            repo: 'repo',
            environment_name: envName
          });
          await mockOctokit.repos.deleteAnEnvironment({
            owner: 'owner',
            repo: 'repo',
            environment_name: envName
          });
          return {
            status: 'success',
            message: `Successfully deleted environment '${envName}'`
          };
        } catch (error) {
          if (error instanceof Error && error.message.includes('Not Found')) {
            return {
              status: 'nochange',
              message: `Environment '${envName}' does not exist, nothing to delete`
            };
          }
          throw error;
        }
      },
      updateEnvironment: (envName: string, config: EnvironmentConfig) => mockOctokit.repos.createOrUpdateEnvironment({
        owner: 'owner',
        repo: 'repo',
        environment_name: envName,
        ...config
      }).then(() => ({
        status: 'success',
        message: `Successfully created environment '${envName}'`
      }))
    }));
    (utils.processReviewers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'User', id: 123, login: 'testuser' },
      { type: 'Team', id: 456, slug: 'testteam' }
    ]);

    process.env.GITHUB_TOKEN = 'token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
  });

  describe('get action', () => {
    it('should get environment configuration successfully', async () => {
      const mockEnvData = {
        name: 'test-env',
        wait_timer: 30,
        reviewers: [
          { type: 'User', id: 123, login: 'testuser' },
          { type: 'Team', id: 456, slug: 'testteam' }
        ],
        prevent_self_review: true,
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };

      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockEnvData });
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('get')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(mockOctokit.repos.getEnvironment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        environment_name: 'test-env'
      });
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
      expect(core.setOutput).toHaveBeenCalledWith('message', "Successfully retrieved environment 'test-env'");
      expect(core.setOutput).toHaveBeenCalledWith('environment', JSON.stringify({ data: mockEnvData }));
    });

    it('should handle non-existent environment', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('get')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(core.setOutput).toHaveBeenCalledWith('status', 'nochange');
      expect(core.setOutput).toHaveBeenCalledWith('message', "Environment 'test-env' does not exist");
      expect(core.setOutput).toHaveBeenCalledWith('environment', '{}');
    });

    it('should handle errors when getting environment', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Get failed'));
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('get')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Get failed');
    });
  });

  describe('delete action', () => {
    it('should delete an existing environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: { name: 'test-env' } });
      mockOctokit.repos.deleteAnEnvironment.mockResolvedValue({ data: {} });
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('delete')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(mockOctokit.repos.deleteAnEnvironment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        environment_name: 'test-env'
      });
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
      expect(core.setOutput).toHaveBeenCalledWith('message', "Successfully deleted environment 'test-env'");
    });

    it('should handle non-existent environment gracefully', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('delete')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(mockOctokit.repos.deleteAnEnvironment).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('status', 'nochange');
      expect(core.setOutput).toHaveBeenCalledWith('message', "Environment 'test-env' does not exist, nothing to delete");
    });

    it('should handle errors when deleting environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: { name: 'test-env' } });
      mockOctokit.repos.deleteAnEnvironment.mockRejectedValue(new Error('Delete failed'));
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('delete')  // action
        .mockReturnValueOnce('test-env'); // environment_name

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Delete failed');
    });
  });

  describe('create/update action', () => {
    it('should create environment with all parameters', async () => {
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('create')  // action
        .mockReturnValueOnce('test-env') // environment_name
        .mockReturnValueOnce('user:testuser,team:testteam') // reviewers
        .mockReturnValueOnce('30') // wait_timer
        .mockReturnValueOnce('true') // prevent_self_review
        .mockReturnValueOnce('{"protected_branches":true,"custom_branch_policies":false}'); // deployment_branch_policy

      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));
      mockOctokit.repos.createOrUpdateEnvironment.mockResolvedValue({ data: {} });

      await run();

      expect(mockOctokit.repos.createOrUpdateEnvironment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        environment_name: 'test-env',
        wait_timer: 30,
        reviewers: [
          { type: 'User', id: 123, login: 'testuser' },
          { type: 'Team', id: 456, slug: 'testteam' }
        ],
        prevent_self_review: true,
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      });
      expect(core.setOutput).toHaveBeenCalledWith('status', 'success');
      expect(core.setOutput).toHaveBeenCalledWith('message', "Successfully created environment 'test-env'");
    });

    it('should handle missing environment variables', async () => {
      delete process.env.GITHUB_TOKEN;
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('GITHUB_TOKEN is required');

      process.env.GITHUB_TOKEN = 'token';
      delete process.env.GITHUB_REPOSITORY;
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('GITHUB_REPOSITORY is required');
    });

    it('should handle invalid JSON in deployment_branch_policy', async () => {
      vi.spyOn(core, 'getInput')
        .mockReturnValueOnce('create')  // action
        .mockReturnValueOnce('test-env') // environment_name
        .mockReturnValueOnce('') // reviewers
        .mockReturnValueOnce('') // wait_timer
        .mockReturnValueOnce('') // prevent_self_review
        .mockReturnValueOnce('invalid-json'); // deployment_branch_policy

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Unexpected token \'i\', "invalid-json" is not valid JSON');
    });
  });
});
