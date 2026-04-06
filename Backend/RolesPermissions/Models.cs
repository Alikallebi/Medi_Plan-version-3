namespace Backend.RolesPermissions;

public sealed class PermissionDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Level { get; set; } = "read";
}

public sealed class PermissionCategory
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Icon { get; set; } = "pi-lock";
    public bool Expanded { get; set; }
    public List<PermissionDefinition> Permissions { get; set; } = [];
}

public sealed class RoleDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "custom";
    public string Color { get; set; } = "#2563eb";
    public string? Icon { get; set; }
    public string? Description { get; set; }
    public int UsersCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public string? ParentRoleId { get; set; }
    public bool IsActive { get; set; }
    public Dictionary<string, string> Permissions { get; set; } = [];
}

public sealed class RoleUserDto
{
    public string Id { get; set; } = string.Empty;
    public string Nom { get; set; } = string.Empty;
    public string Prenom { get; set; } = string.Empty;
    public string Matricule { get; set; } = string.Empty;
    public string Service { get; set; } = string.Empty;
    public string? Photo { get; set; }
    public string Status { get; set; } = "actif";
}

public sealed class RoleHistoryDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "modified";
    public string Description { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string By { get; set; } = "Système";
    public string Icon { get; set; } = "pi-history";
}

public sealed class CreateRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = "custom";
    public string Color { get; set; } = "#2563eb";
    public string? Icon { get; set; } = "pi-users";
    public string? ParentRoleId { get; set; }
    public bool IsActive { get; set; } = true;
    public string? UpdatedBy { get; set; }
}

public sealed class UpdateRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = "#2563eb";
    public string? Icon { get; set; } = "pi-users";
    public string? ParentRoleId { get; set; }
    public bool IsActive { get; set; } = true;
    public string? UpdatedBy { get; set; }
}

public sealed class SetPermissionLevelRequest
{
    public string Level { get; set; } = "none";
    public string? UpdatedBy { get; set; }
}

public sealed class SetAllPermissionsRequest
{
    public string Level { get; set; } = "read";
    public string? UpdatedBy { get; set; }
}
