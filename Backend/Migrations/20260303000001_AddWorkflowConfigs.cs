using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkflowConfigs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkflowConfigs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ServiceId = table.Column<int>(type: "INTEGER", nullable: false),
                    ServiceName = table.Column<string>(type: "TEXT", nullable: false, defaultValue: ""),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    Version = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                    SuperAdminFinalRequired = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true),
                    CreatedBy = table.Column<string>(type: "TEXT", nullable: false, defaultValue: ""),
                    UpdatedBy = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowConfigs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowConfigEtapes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    WorkflowConfigId = table.Column<int>(type: "INTEGER", nullable: false),
                    Ordre = table.Column<int>(type: "INTEGER", nullable: false),
                    RoleValidateur = table.Column<string>(type: "TEXT", nullable: false, defaultValue: ""),
                    ValidateurSpecifiqueId = table.Column<int>(type: "INTEGER", nullable: true),
                    DelaiMaxHeures = table.Column<int>(type: "INTEGER", nullable: true),
                    IsFinalApproval = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowConfigEtapes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowConfigEtapes_WorkflowConfigs_WorkflowConfigId",
                        column: x => x.WorkflowConfigId,
                        principalTable: "WorkflowConfigs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowConfigEtapes_WorkflowConfigId",
                table: "WorkflowConfigEtapes",
                column: "WorkflowConfigId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "WorkflowConfigEtapes");
            migrationBuilder.DropTable(name: "WorkflowConfigs");
        }
    }
}
