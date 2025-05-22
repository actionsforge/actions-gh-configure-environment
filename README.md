# 🚀 GitHub Environment Configuration

![CI](https://github.com/actionsforge/actions-gh-configure-environment/actions/workflows/ci.yml/badge.svg)

[![Build, Commit, Tag & Release](https://github.com/actionsforge/actions-gh-configure-environment/actions/workflows/build-and-tag.yml/badge.svg)](https://github.com/actionsforge/actions-gh-configure-environment/actions/workflows/build-and-tag.yml)

Configure your GitHub environments from a declarative YAML configuration using the GitHub API. The action is fully managed, meaning it will create, update, or delete environments to match exactly what is defined in your configuration file.

---

## ✅ Features

- Fully managed environment configuration - environments not in the config file will be removed
- Configure multiple environments from a single YAML file
- Set environment reviewers (users and teams)
- Configure wait timers for deployments
- Set deployment branch policies
- Prevent self-review of deployments
- Support for debug and dry-run modes
- Comprehensive error handling and validation
- Detailed logging and status messages
- Support for both repository and organization environments

---

## 📦 Usage

### As a GitHub Action

```yaml
- uses: actionsforge/actions-gh-configure-environment@v1
  with:
    token: ${{ secrets.GH_ENV_CONFIG_TOKEN }}  # GitHub token with required permissions
    config-path: .github/environments.yaml     # Path to your environments config
    dry-run: false                            # Set to true to preview changes
    debug: false                              # Enable detailed logging
```

### As a Node.js Module

```typescript
import { GitHubService } from 'actions-gh-configure-environment';

const service = new GitHubService({
  token: 'your-github-token',
  owner: 'your-org',
  repo: 'your-repo'
});

// Get environment configuration
const config = await service.getEnvironmentConfig('staging');

// Update environment
await service.updateEnvironment('staging', {
  wait_timer: 30,
  reviewers: [
    { type: 'User', login: 'admin' },
    { type: 'Team', slug: 'security' }
  ]
});

// Delete environment
await service.deleteAnEnvironment('staging');
```

---

## 🔧 Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `token` | GitHub token with required permissions | Yes | - |
| `config-path` | Path to environments configuration file | No | `.github/environments.yaml` |
| `dry-run` | Run in dry-run mode (no changes made) | No | `false` |
| `debug` | Enable debug mode for detailed logging | No | `false` |

---

## 📄 Configuration

### Sample `environments.yaml`

```yaml
# .github/environments.yaml
environments:
  test:
    wait_timer: 60                    # Optional: Minutes to wait before allowing deployment
    reviewers:                        # Optional: List of reviewers
      - type: User                    # Required: Type of reviewer ('User' or 'Team')
        login: admin-user             # Required: GitHub username for User type
      - type: Team
        slug: security-team           # Required: Team slug for Team type
    prevent_self_review: true         # Optional: Whether to prevent self-review
    deployment_branch_policy:         # Optional: Deployment branch policy configuration
      protected_branches: true        # Required: Whether to use protected branches
      custom_branch_policies: false   # Required: Whether to allow custom branch policies

  staging:
    wait_timer: 30
    reviewers:
      - type: User
        login: dev-user
      - type: Team
        slug: dev-team
    prevent_self_review: true
    deployment_branch_policy:
      protected_branches: true
      custom_branch_policies: false

  development:
    wait_timer: 0
    reviewers: []
    prevent_self_review: false
    deployment_branch_policy:
      protected_branches: false
      custom_branch_policies: false
```

### Environment Configuration Parameters

| Parameter | Required | Description | Valid Values | Default |
|-----------|----------|-------------|--------------|---------|
| `wait_timer` | No | Minutes to wait before allowing deployment | Number ≥ 0 | - |
| `reviewers` | No | List of reviewers | Array of reviewer objects | `[]` |
| `prevent_self_review` | No | Whether to prevent self-review | `true` or `false` | `false` |
| `deployment_branch_policy` | No | Deployment branch policy configuration | Object | - |

### Reviewer Configuration Parameters

| Parameter | Required | Description | Valid Values |
|-----------|----------|-------------|--------------|
| `type` | Yes | Type of reviewer | `User` or `Team` |
| `login` | Yes* | GitHub username | Valid GitHub username |
| `slug` | Yes* | Team slug | Valid team slug |

\* Required based on type: `login` for User type, `slug` for Team type

### Deployment Branch Policy Parameters

| Parameter | Required | Description | Valid Values |
|-----------|----------|-------------|--------------|
| `protected_branches` | Yes | Whether to use protected branches | `true` or `false` |
| `custom_branch_policies` | Yes | Whether to allow custom branch policies | `true` or `false` |

---

## 🔒 Permissions

To manage environments, use a token with the following permissions:

- `repo` scope for repository environments
- `admin:org` scope for organization environments

The default `GITHUB_TOKEN` only works in **organization-owned** repositories and must have the appropriate scopes enabled via workflow permissions. See [GitHub's documentation](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token) for more details.

### Required Repository Permissions

For repository environments, ensure your token has:

- `contents: read` - To read the configuration file
- `environments: write` - To manage environments

### Required Organization Permissions

For organization environments, ensure your token has:

- `contents: read` - To read the configuration file
- `environments: write` - To manage environments
- `members: read` - To verify user and team memberships

---

## 🔍 Debugging

Enable debug mode to get detailed logs about the action's execution:

```yaml
- uses: actionsforge/actions-gh-configure-environment@v1
  with:
    debug: true
```

This will output:

- Configuration file parsing details
- Environment comparison results
- API request/response information
- Detailed error messages

---

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
