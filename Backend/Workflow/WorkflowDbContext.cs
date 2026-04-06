using Microsoft.EntityFrameworkCore;
using System;

namespace Backend.Workflow
{
    public class WorkflowDbContext : DbContext
    {
        public WorkflowDbContext(DbContextOptions<WorkflowDbContext> options) : base(options) { }

        public DbSet<WorkflowNotification> Notifications { get; set; }
        public DbSet<WorkflowConfigDb> WorkflowConfigs { get; set; }
        public DbSet<WorkflowConfigEtapeDb> WorkflowConfigEtapes { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<WorkflowConfigDb>()
                .HasMany(c => c.Etapes)
                .WithOne(e => e.Config)
                .HasForeignKey(e => e.WorkflowConfigId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
