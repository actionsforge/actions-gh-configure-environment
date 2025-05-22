import { GitHubService } from '../github';
import { Octokit } from '@octokit/rest';
import { EnvironmentConfig, Reviewer } from '../types';
import * as core from '@actions/core';

jest.mock('@octokit/rest');
jest.mock('@actions/core', () => ({
  error: jest.fn(),
  debug: jest.fn()
}));

describe('GitHubService', () => {
  let mockOctokit: {
    users: { getByUsername: jest.Mock };
    teams: {
      getByName: jest.Mock;
      listReposInOrg: jest.Mock;
    };
    repos: {
      getEnvironment: jest.Mock;
      deleteAnEnvironment: jest.Mock;
      createOrUpdateEnvironment: jest.Mock;
      getAllEnvironments: jest.Mock;
    };
  };
  let service: GitHubService;
  const mockToken = 'mock-token';
  const mockRepo = 'owner/repo';

  beforeEach(() => {
    jest.clearAllMocks();
    mockOctokit = {
      users: {
        getByUsername: jest.fn()
      },
      teams: {
        getByName: jest.fn(),
        listReposInOrg: jest.fn()
      },
      repos: {
        getEnvironment: jest.fn(),
        deleteAnEnvironment: jest.fn(),
        createOrUpdateEnvironment: jest.fn(),
        getAllEnvironments: jest.fn()
      }
    };
    (Octokit as unknown as jest.Mock).mockImplementation(() => mockOctokit);
    service = new GitHubService(mockToken, mockRepo);
    (service as unknown as { octokit: typeof mockOctokit }).octokit = mockOctokit;
  });

  describe('constructor', () => {
    it('should create instance with valid repository format', () => {
      const service = new GitHubService(mockToken, mockRepo);
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should throw error for empty token', () => {
      expect(() => new GitHubService('', mockRepo))
        .toThrow('Token is required');
    });

    it('should throw error for empty repository', () => {
      expect(() => new GitHubService(mockToken, ''))
        .toThrow('Repository is required');
    });
  });

  describe('getUser', () => {
    it('should return user reviewer', async () => {
      const mockUser = { id: 123, login: 'testuser' };
      mockOctokit.users.getByUsername.mockResolvedValue({ data: mockUser });

      const result = await service.getUser('testuser');

      expect(result).toEqual({ type: 'User', id: 123, login: 'testuser' });
      expect(mockOctokit.users.getByUsername).toHaveBeenCalledWith({ username: 'testuser' });
    });

    it('should handle errors when getting user', async () => {
      mockOctokit.users.getByUsername.mockRejectedValue(new Error('User not found'));

      await expect(service.getUser('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('getTeam', () => {
    it('should return team reviewer', async () => {
      const mockTeam = { id: 456, slug: 'testteam' };
      mockOctokit.teams.getByName.mockResolvedValue({ data: mockTeam });

      const result = await service.getTeam('testteam');

      expect(result).toEqual({ type: 'Team', id: 456, slug: 'testteam' });
      expect(mockOctokit.teams.getByName).toHaveBeenCalledWith({
        org: 'owner',
        team_slug: 'testteam'
      });
    });

    it('should handle errors when getting team', async () => {
      mockOctokit.teams.getByName.mockRejectedValue(new Error('Team not found'));

      await expect(service.getTeam('nonexistent')).rejects.toThrow('Team not found');
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should return environment configuration', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 30 },
          { type: 'required_reviewers', reviewers: [] }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');

      expect(result).toEqual(mockConfig);
      expect(mockOctokit.repos.getEnvironment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        environment_name: 'test-env'
      });
    });

    it('should handle errors when getting environment config', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Config not found'));

      await expect(service.getEnvironmentConfig('nonexistent')).rejects.toThrow('Config not found');
    });

    it('should handle missing protection rules', async () => {
      const mockConfig = {
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing deployment branch policy', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 30 }
        ]
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle empty protection rules', async () => {
      const mockConfig = {
        protection_rules: [],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle API errors', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('API Error'));

      await expect(service.getEnvironmentConfig('test-env')).rejects.toThrow('API Error');
    });

    it('should handle null response data', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: null });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toBeNull();
    });

    it('should handle undefined response data', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: undefined });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toBeUndefined();
    });

    it('should handle malformed protection rules', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'invalid' },
          { type: 'wait_timer' },
          { type: 'required_reviewers' },
          { type: 'prevent_self_review' }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing protection rule type', async () => {
      const mockConfig = {
        protection_rules: [
          { wait_timer: 30 },
          { reviewers: [] },
          { prevent_self_review: true }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing deployment branch policy properties', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 30 }
        ],
        deployment_branch_policy: {}
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing reviewer data in protection rules', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 30 },
          { type: 'required_reviewers', reviewers: [null, undefined, {}] },
          { type: 'prevent_self_review', prevent_self_review: true }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing wait timer value', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer' },
          { type: 'required_reviewers', reviewers: [] },
          { type: 'prevent_self_review', prevent_self_review: true }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should handle missing prevent self review value', async () => {
      const mockConfig = {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 30 },
          { type: 'required_reviewers', reviewers: [] },
          { type: 'prevent_self_review' }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false
        }
      };
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: mockConfig });

      const result = await service.getEnvironmentConfig('test-env');
      expect(result).toEqual(mockConfig);
    });

    it('should rethrow error if getEnvironment returns "Not Found"', async () => {
      const error = new Error('Not Found');
      mockOctokit.repos.getEnvironment.mockRejectedValue(error);

      await expect(service.getEnvironmentConfig('test-env'))
        .rejects.toThrow('Not Found');
    });

    it('should extract existing reviewers from required_reviewers rule', async () => {
      const service = new GitHubService('fake-token', 'owner/repo');

      jest.spyOn(service, 'getEnvironmentConfig').mockResolvedValue({
        protection_rules: [
          {
            type: 'required_reviewers',
            reviewers: [
              {
                type: 'User',
                reviewer: {
                  id: 101,
                  login: 'alice'
                }
              },
              {
                type: 'Team',
                reviewer: {
                  id: 202,
                  slug: 'devs'
                }
              }
            ]
          }
        ]
      });

      const result = await service.resolveReviewers('test-env', []);

      expect(result).toEqual([]);
      expect(service.getEnvironmentConfig).toHaveBeenCalledWith('test-env');
    });

  });

  describe('updateEnvironment', () => {
    const mockConfig: EnvironmentConfig = {
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

    it('should create new environment if it does not exist', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));
      mockOctokit.repos.createOrUpdateEnvironment.mockResolvedValue({ data: {} });

      const result = await service.updateEnvironment('test-env', mockConfig);

      expect(result).toEqual({
        status: 'success',
        message: 'Update successful: environment created.'
      });
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
    });

    it('should update existing environment if configuration differs', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            { type: 'wait_timer', wait_timer: 15 },
            { type: 'required_reviewers', reviewers: [] },
            { type: 'prevent_self_review', prevent_self_review: false }
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: true
          }
        }
      });
      mockOctokit.repos.createOrUpdateEnvironment.mockResolvedValue({ data: {} });

      const result = await service.updateEnvironment('test-env', mockConfig);

      expect(result).toEqual({
        status: 'success',
        message: 'Update successful: environment configuration updated.'
      });
      expect(mockOctokit.repos.createOrUpdateEnvironment).toHaveBeenCalled();
    });

    it('should not update if configuration is identical', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            { type: 'wait_timer', wait_timer: 30 },
            {
              type: 'required_reviewers',
              reviewers: [
                { type: 'User', reviewer: { id: 123, login: 'testuser' } },
                { type: 'Team', reviewer: { id: 456, slug: 'testteam' } }
              ]
            },
            { type: 'prevent_self_review', prevent_self_review: true }
          ],
          deployment_branch_policy: {
            protected_branches: true,
            custom_branch_policies: false
          }
        }
      });

      const result = await service.updateEnvironment('test-env', mockConfig);

      expect(result).toEqual({
        status: 'success',
        message: 'Update successful: environment configuration updated.'
      });
      expect(mockOctokit.repos.createOrUpdateEnvironment).toHaveBeenCalled();
    });

    it('should handle errors when updating environment', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Update failed'));

      await expect(service.updateEnvironment('test-env', mockConfig)).rejects.toThrow('Update failed');
    });

    it('should handle missing protection rules in existing environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          deployment_branch_policy: {
            protected_branches: true,
            custom_branch_policies: false
          }
        }
      });
      mockOctokit.repos.createOrUpdateEnvironment.mockResolvedValue({ data: {} });

      const result = await service.updateEnvironment('test-env', mockConfig);

      expect(result).toEqual({
        status: 'success',
        message: 'Update successful: environment configuration updated.'
      });
      expect(mockOctokit.repos.createOrUpdateEnvironment).toHaveBeenCalled();
    });

    it('should handle missing deployment branch policy in existing environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            { type: 'wait_timer', wait_timer: 30 }
          ]
        }
      });
      mockOctokit.repos.createOrUpdateEnvironment.mockResolvedValue({ data: {} });

      const result = await service.updateEnvironment('test-env', mockConfig);

      expect(result).toEqual({
        status: 'success',
        message: 'Update successful: environment configuration updated.'
      });
      expect(mockOctokit.repos.createOrUpdateEnvironment).toHaveBeenCalled();
    });

    it('should handle create/update API errors', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));
      mockOctokit.repos.createOrUpdateEnvironment.mockRejectedValue(new Error('API Error'));

      await expect(service.updateEnvironment('test-env', mockConfig)).rejects.toThrow('API Error');
    });

    it('should handle null response data in updateEnvironment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: null });

      await expect(service.updateEnvironment('test-env', mockConfig))
        .rejects
        .toThrow('Cannot read properties of null (reading \'protection_rules\')');
    });

    it('should detect a prevent_self_review rule via updateEnvironment', async () => {
      const environmentName = 'test-env';

      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            { type: 'prevent_self_review', prevent_self_review: true },
            {
              type: 'required_reviewers',
              reviewers: []
            }
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: false
          }
        }
      });

      const result = await service.updateEnvironment(environmentName, {
        prevent_self_review: true,
        reviewers: [],
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: false
        }
      });

      expect(result.status).toBe('success');
      expect(result.message).toBe('Update successful: environment configuration updated.');
    });
  });

  describe('deleteAnEnvironment', () => {
    it('should delete existing environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: { name: 'test-env' } });
      mockOctokit.repos.deleteAnEnvironment.mockResolvedValue({ data: {} });

      const result = await service.deleteAnEnvironment('test-env');

      expect(result).toEqual({
        status: 'success',
        message: "Update successful: environment 'test-env' deleted."
      });
      expect(mockOctokit.repos.deleteAnEnvironment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        environment_name: 'test-env'
      });
    });

    it('should handle non-existent environment gracefully', async () => {
      mockOctokit.repos.getEnvironment.mockRejectedValue(new Error('Not Found'));

      const result = await service.deleteAnEnvironment('test-env');

      expect(result).toEqual({
        status: 'nochange',
        message: "No update required: environment 'test-env' does not exist."
      });
      expect(mockOctokit.repos.deleteAnEnvironment).not.toHaveBeenCalled();
    });

    it('should handle other errors when deleting environment', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: { name: 'test-env' } });
      mockOctokit.repos.deleteAnEnvironment.mockRejectedValue(new Error('Delete failed'));

      await expect(service.deleteAnEnvironment('test-env')).rejects.toThrow('Delete failed');
    });

    it('should return nochange when getEnvironment returns null', async () => {
      mockOctokit.repos.getEnvironment.mockResolvedValue({ data: null });

      const result = await service.deleteAnEnvironment('test-env');

      expect(result).toEqual({
        status: 'nochange',
        message: "No update required: environment 'test-env' does not exist."
      });

      expect(mockOctokit.repos.deleteAnEnvironment).not.toHaveBeenCalled();
    });

  });

  describe('getAllEnvironments', () => {
    it('should return list of environments', async () => {
      const mockEnvironments = [{ name: 'env1' }, { name: 'env2' }];
      mockOctokit.repos.getAllEnvironments = jest.fn().mockResolvedValue({ data: { environments: mockEnvironments } });

      const result = await service.getAllEnvironments();
      expect(result).toEqual(['env1', 'env2']);
      expect(mockOctokit.repos.getAllEnvironments).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo'
      });
    });

    it('should handle empty environments list', async () => {
      mockOctokit.repos.getAllEnvironments = jest.fn().mockResolvedValue({ data: { environments: [] } });

      const result = await service.getAllEnvironments();
      expect(result).toEqual([]);
    });

    it('should handle errors when getting environments', async () => {
      mockOctokit.repos.getAllEnvironments = jest.fn().mockRejectedValue(new Error('Failed to get environments'));

      await expect(service.getAllEnvironments()).rejects.toThrow('Failed to get environments');
    });
  });

  describe('resolveReviewers', () => {
    it('should resolve reviewers successfully', async () => {
      const reviewers = [
        { type: 'User' as const, login: 'testuser' },
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.users.getByUsername.mockResolvedValue({ data: { id: 123, login: 'testuser' } });
      mockOctokit.teams.getByName.mockResolvedValue({ data: { id: 456, slug: 'testteam' } });
      mockOctokit.teams.listReposInOrg = jest.fn().mockResolvedValue({ data: [{ full_name: 'owner/repo' }] });

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([
        { type: 'User', id: 123, login: 'testuser' },
        { type: 'Team', id: 456, slug: 'testteam' }
      ]);
      expect(mockOctokit.users.getByUsername).toHaveBeenCalledWith({ username: 'testuser' });
      expect(mockOctokit.teams.getByName).toHaveBeenCalledWith({
        org: 'owner',
        team_slug: 'testteam'
      });
    });

    it('should handle team without repository access', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({ data: { id: 456, slug: 'testteam' } });
      mockOctokit.teams.listReposInOrg = jest.fn().mockResolvedValue({ data: [] });

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Team testteam does not have access to owner/repo repository'));
    });

    it('should handle non-existent user', async () => {
      const reviewers = [
        { type: 'User' as const, login: 'nonexistent' }
      ];

      mockOctokit.users.getByUsername.mockRejectedValue(new Error('Not Found'));
      mockOctokit.teams.listReposInOrg = jest.fn().mockResolvedValue({ data: [] });

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
    });

    it('should handle invalid reviewer type', async () => {
      const reviewers = [
        { type: 'Invalid' as 'User' | 'Team', login: 'testuser' }
      ];

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reviewer type'));
    });

    it('should handle empty reviewers array', async () => {
      const result = await service.resolveReviewers('test-env', []);
      expect(result).toEqual([]);
    });

    it('should handle mixed reviewer types', async () => {
      const reviewers = [
        { type: 'User' as const, login: 'testuser' },
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.users.getByUsername.mockResolvedValue({ data: { id: 123, login: 'testuser' } });
      mockOctokit.teams.getByName.mockResolvedValue({ data: { id: 456, slug: 'testteam' } });
      mockOctokit.teams.listReposInOrg = jest.fn().mockResolvedValue({ data: [{ full_name: 'owner/repo' }] });

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([
        { type: 'User', id: 123, login: 'testuser' },
        { type: 'Team', id: 456, slug: 'testteam' }
      ]);
    });

    it('should handle API errors during team access check', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({ data: { id: 456, slug: 'testteam' } });
      mockOctokit.teams.listReposInOrg = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith('Team testteam does not have access to owner/repo repository');
      expect(core.error).toHaveBeenCalledWith('The following teams do not have access to owner/repo: testteam');
    });

    it('should handle unexpected errors during team processing', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({ data: { id: 456, slug: 'testteam' } });
      mockOctokit.teams.listReposInOrg = jest.fn().mockRejectedValue(new Error('Unexpected Error'));

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith('Team testteam does not have access to owner/repo repository');
    });

    it('should handle missing team data', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({ data: { slug: 'testteam' } });

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reviewer format'));
    });

    it('should handle undefined team data', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({
        data: { id: 456, slug: 'testteam' }
      });

      mockOctokit.teams.listReposInOrg = jest.fn().mockResolvedValue({ data: [] });

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith('Team testteam does not have access to owner/repo repository');
      expect(core.error).toHaveBeenCalledWith('The following teams do not have access to owner/repo: testteam');
    });

    it('should handle missing login in user reviewer', async () => {
      const reviewers = [
        { type: 'User' as const }
      ];

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reviewer format'));
    });

    it('should handle missing slug in team reviewer', async () => {
      const reviewers = [
        { type: 'Team' as const }
      ];

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reviewer format'));
    });

    it('should handle invalid reviewer type', async () => {
      const reviewers = [
        { type: 'Invalid' as 'User' | 'Team', login: 'testuser' }
      ];

      const result = await service.resolveReviewers('test-env', reviewers);
      expect(result).toEqual([]);
      expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid reviewer type'));
    });

    it('should log and re-throw unexpected errors during team processing', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockImplementation(() => {
        throw new TypeError('Simulated unexpected failure');
      });

      await expect(service.resolveReviewers('test-env', reviewers))
        .rejects.toThrow('Simulated unexpected failure');

      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process reviewer')
      );
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining('Simulated unexpected failure')
      );
    });

    it('should log error and track team when it has no access', async () => {
      const reviewers = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({
        data: { id: 123, slug: 'testteam' }
      });

      mockOctokit.teams.listReposInOrg.mockResolvedValue({ data: [] });

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);

      expect(core.error).toHaveBeenCalledWith(
        'Team testteam does not have access to owner/repo repository'
      );

      expect(core.error).toHaveBeenCalledWith(
        'The following teams do not have access to owner/repo: testteam'
      );
    });

    it('should sort reviewers by login for users and slug for teams', async () => {
      const environmentName = 'test-env';

      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            {
              type: 'required_reviewers',
              reviewers: [
                { type: 'User', reviewer: { id: 2, login: 'zeta' } },
                { type: 'User', reviewer: { id: 1, login: 'alpha' } },
                { type: 'Team', reviewer: { id: 4, slug: 'devs' } },
                { type: 'Team', reviewer: { id: 3, slug: 'admins' } }
              ]
            }
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: false
          }
        }
      });

      const reviewers: Reviewer[] = [
        { type: 'Team' as const, id: 3, slug: 'admins' },
        { type: 'Team' as const, id: 4, slug: 'devs' },
        { type: 'User' as const, id: 1, login: 'alpha' },
        { type: 'User' as const, id: 2, login: 'zeta' }
      ];

      const result = await service.updateEnvironment(environmentName, {
        reviewers,
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: false
        }
      });

      expect(result.status).toBe('nochange');
    });

    it('should log error and record failed team when API returns 403', async () => {
      const reviewers: Reviewer[] = [
        { type: 'Team' as const, slug: 'testteam' }
      ];

      mockOctokit.teams.getByName.mockResolvedValue({
        data: { id: 456, slug: 'testteam' }
      });

      const error = new Error('Resource not accessible by integration');
      Object.defineProperty(error, 'status', { value: 403 });
      mockOctokit.teams.listReposInOrg.mockRejectedValue(error);

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);

      expect(core.error).toHaveBeenCalledWith(
        'Team testteam does not have access to owner/repo repository'
      );

      expect(core.error).toHaveBeenCalledWith(
        'The following teams do not have access to owner/repo: testteam'
      );
    });

    it('should log and record failed team when GitHub API returns 404', async () => {
      const reviewers: Reviewer[] = [
        { type: 'Team', slug: 'testteam' }
      ];

      const error = new Error('Not Found');
      Object.defineProperty(error, 'status', { value: 404 });
      mockOctokit.teams.getByName.mockRejectedValue(error);

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);

      expect(core.error).toHaveBeenCalledWith(
        'Error adding team testteam: Not Found'
      );

      expect(core.error).toHaveBeenCalledWith(
        'The following teams do not have access to owner/repo: testteam'
      );
    });

    it('should log error and skip reviewer with invalid format (missing login)', async () => {
      const reviewers: Reviewer[] = [
        { type: 'User' }
      ];

      const result = await service.resolveReviewers('test-env', reviewers);

      expect(result).toEqual([]);

      expect(core.error).toHaveBeenCalledWith(
        'Invalid reviewer format for owner/repo: {"type":"User"}'
      );
    });

    it('should detect a prevent_self_review rule via updateEnvironment', async () => {
      const environmentName = 'test-env';

      mockOctokit.repos.getEnvironment.mockResolvedValue({
        data: {
          protection_rules: [
            { type: 'prevent_self_review', prevent_self_review: true },
            {
              type: 'required_reviewers',
              reviewers: []
            }
          ],
          deployment_branch_policy: {
            protected_branches: false,
            custom_branch_policies: false
          }
        }
      });

      const result = await service.updateEnvironment(environmentName, {
        prevent_self_review: true,
        reviewers: [],
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: false
        }
      });

      expect(result.status).toBe('success');
      expect(result.message).toBe('Update successful: environment configuration updated.');
    });

    it('should log error and skip non-object reviewers', async () => {
      const service = new GitHubService('fake-token', 'owner/repo');

      const invalidInputs: unknown[] = [null, undefined, 'string', 42, true];

      const result = await service.resolveReviewers('test-env', invalidInputs as Reviewer[]);

      expect(result).toEqual([]);

      for (const input of invalidInputs) {
        expect(core.error).toHaveBeenCalledWith(
          `Invalid reviewer format for owner/repo: ${JSON.stringify(input)}`
        );
      }
    });

    it('should log and track team when hasTeamAccess throws API Error', async () => {
      mockOctokit.teams.getByName.mockResolvedValue({
        data: { id: 456, slug: 'testteam' }
      });

      // Inject hasTeamAccess to throw exactly "API Error"
      jest.spyOn(service, 'hasTeamAccess').mockImplementation(async () => {
        throw new Error('API Error');
      });

      const result = await service.resolveReviewers('test-env', [
        { type: 'Team', slug: 'testteam' }
      ]);

      expect(result).toEqual([]); // Reviewer skipped due to error

      expect(core.error).toHaveBeenCalledWith(
        'Error adding team testteam: API Error'
      );

      expect(core.error).toHaveBeenCalledWith(
        'The following teams do not have access to owner/repo: testteam'
      );
    });
  });
});
