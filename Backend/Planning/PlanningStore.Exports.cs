using MySqlConnector;
using System.Globalization;
using System.Text;

namespace Backend.Planning;

public sealed partial class PlanningStore
{
    public async Task<(string FileName, string Content)> ExportCsvAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd = null)
    {
        var planning = await GetPlanningAsync(serviceId, serviceName, weekStart, weekEnd);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        var personnelNames = await ResolvePersonnelNamesAsync(connection, planning.Assignments);
        var rows = BuildExportRows(planning, personnelNames);
        var sb = new StringBuilder();

        sb.AppendLine("Date;Jour;Utilisateur;Identifiant;Service;Type;Poste;Horaire;Note");

        foreach (var row in rows)
        {
            sb.AppendLine(string.Join(";", new[]
            {
                Csv(row.Date),
                Csv(row.DayName),
                Csv(row.UserName),
                Csv(row.PersonnelId),
                Csv(row.ServiceName),
                Csv(row.ShiftType),
                Csv(row.Poste),
                Csv(row.Schedule),
                Csv(row.Note)
            }));
        }

        var fileName = $"planning-{serviceId}-{planning.WeekStart:yyyyMMdd}.csv";
        return (fileName, sb.ToString());
    }

    public async Task<(string FileName, string Content)> ExportExcelAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd = null)
    {
        var planning = await GetPlanningAsync(serviceId, serviceName, weekStart, weekEnd);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        var personnelNames = await ResolvePersonnelNamesAsync(connection, planning.Assignments);
        var rows = BuildExportRows(planning, personnelNames);
        var sb = new StringBuilder();

        sb.AppendLine("<?xml version=\"1.0\"?>");
        sb.AppendLine("<?mso-application progid=\"Excel.Sheet\"?>");
        sb.AppendLine("<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\" xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">");
        sb.AppendLine("  <Styles>");
        sb.AppendLine("    <Style ss:ID=\"Default\" ss:Name=\"Normal\"><Alignment ss:Vertical=\"Center\"/></Style>");
        sb.AppendLine("    <Style ss:ID=\"title\"><Font ss:Bold=\"1\" ss:Size=\"14\"/><Interior ss:Color=\"#EAF3FF\" ss:Pattern=\"Solid\"/></Style>");
        sb.AppendLine("    <Style ss:ID=\"meta\"><Font ss:Bold=\"1\"/></Style>");
        sb.AppendLine("    <Style ss:ID=\"header\"><Font ss:Bold=\"1\" ss:Color=\"#FFFFFF\"/><Interior ss:Color=\"#2563EB\" ss:Pattern=\"Solid\"/></Style>");
        sb.AppendLine("    <Style ss:ID=\"cell\"><Borders><Border ss:Position=\"Bottom\" ss:LineStyle=\"Continuous\" ss:Weight=\"1\" ss:Color=\"#E5E7EB\"/></Borders></Style>");
        sb.AppendLine("  </Styles>");
        sb.AppendLine("  <Worksheet ss:Name=\"Planning\">");
        sb.AppendLine("    <Table>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"90\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"85\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"180\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"95\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"130\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"90\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"170\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"95\"/>");
        sb.AppendLine("      <Column ss:AutoFitWidth=\"0\" ss:Width=\"210\"/>");

        WriteExcelRow(sb, [
            "Planning - Export clair",
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty
        ], "title");

        WriteExcelRow(sb, [
            $"Service: {planning.ServiceName}",
            $"Periode: {planning.WeekStart:dd/MM/yyyy} - {planning.WeekEnd:dd/MM/yyyy}",
            $"Total affectations: {rows.Count}",
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty
        ], "meta");

        WriteExcelRow(sb, [
            "Date", "Jour", "Utilisateur", "Identifiant", "Service", "Type", "Poste", "Horaire", "Note"
        ], "header");

        foreach (var row in rows)
        {
            WriteExcelRow(sb, [
                row.Date,
                row.DayName,
                row.UserName,
                row.PersonnelId,
                row.ServiceName,
                row.ShiftType,
                row.Poste,
                row.Schedule,
                row.Note
            ], "cell");
        }

        sb.AppendLine("    </Table>");
        sb.AppendLine("  </Worksheet>");
        sb.AppendLine("</Workbook>");

        var fileName = $"planning-{serviceId}-{planning.WeekStart:yyyyMMdd}.xls";
        return (fileName, sb.ToString());
    }

    public async Task<(string FileName, byte[] Content)> ExportPdfAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd = null)
    {
        var planning = await GetPlanningAsync(serviceId, serviceName, weekStart, weekEnd);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        var personnelNames = await ResolvePersonnelNamesAsync(connection, planning.Assignments);
        var rows = BuildExportRows(planning, personnelNames);
        var pdf = BuildSimplePdf(planning, rows);
        var fileName = $"planning-{serviceId}-{planning.WeekStart:yyyyMMdd}-{DateTime.Now:HHmmss}.pdf";
        return (fileName, pdf);
    }

    /// <summary>
    /// Export du planning au format HTML moderne (design médical professionnel)
    /// </summary>
    public async Task<(string FileName, string Content)> ExportHtmlAsync(string serviceId, string serviceName, DateTime weekStart, DateTime? weekEnd = null)
    {
        var planning = await GetPlanningAsync(serviceId, serviceName, weekStart, weekEnd);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        var personnelNames = await ResolvePersonnelNamesAsync(connection, planning.Assignments);
        var rows = BuildExportRows(planning, personnelNames);
        
        // Lire le template HTML
        var templatePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Planning", "PlanningExportTemplate.html");
        string htmlTemplate;
        
        if (File.Exists(templatePath))
        {
            htmlTemplate = await File.ReadAllTextAsync(templatePath);
        }
        else
        {
            // Template intégré si le fichier n'existe pas
            htmlTemplate = GetEmbeddedHtmlTemplate();
        }

        // Calculer les statistiques
        var activeStaff = planning.Assignments?.Select(a => a.PersonnelId).Distinct().Count() ?? 0;
        var temporaryCount = planning.Assignments?.Count(a => 
            a.PersonnelId?.StartsWith("temp_") == true || 
            int.TryParse(a.PersonnelId ?? "", out _)) ?? 0;
        var occupancyRate = planning.Assignments?.Count() > 0 
            ? Math.Round((double)activeStaff / Math.Max(1, planning.Assignments.Count) * 100, 0) 
            : 0;

        // Générer les lignes du tableau
        var tableRows = new StringBuilder();
        foreach (var row in rows)
        {
            var shiftClass = NormalizeShiftLabel(row.ShiftType).ToLowerInvariant().Replace(" ", "-").Replace("è", "e").Replace("é", "e");
            var shiftBadgeClass = $"shift-{shiftClass}";
            
            tableRows.AppendLine($@"
                    <tr class=""shift-{shiftClass}"">
                        <td class=""date"">{row.Date}</td>
                        <td class=""day"">{row.DayName}</td>
                        <td class=""user"">{HtmlEncode(row.UserName)}</td>
                        <td>{HtmlEncode(row.PersonnelId)}</td>
                        <td><span class=""shift-badge {shiftBadgeClass}"">{HtmlEncode(row.ShiftType)}</span></td>
                        <td>{HtmlEncode(row.Poste)}</td>
                        <td>{HtmlEncode(row.Schedule)}</td>
                        <td>{HtmlEncode(row.Note)}</td>
                    </tr>");
        }

        // Remplacer les placeholders dans le template
        var reference = $"PLAN-{serviceId.ToUpperInvariant()}-{planning.WeekStart:yyyyMMdd}";
        var htmlContent = htmlTemplate
            .Replace("{{SERVICE_NAME}}", HtmlEncode(planning.ServiceName))
            .Replace("{{WEEK_START}}", planning.WeekStart.ToString("dd/MM/yyyy"))
            .Replace("{{WEEK_END}}", planning.WeekEnd.ToString("dd/MM/yyyy"))
            .Replace("{{REFERENCE}}", reference)
            .Replace("{{VERSION}}", "2.0")
            .Replace("{{CHEF_SERVICE}}", "Dr. Chef Service") // À personnaliser selon vos données
            .Replace("{{TOTAL_ASSIGNMENTS}}", rows.Count.ToString())
            .Replace("{{ACTIVE_STAFF}}", activeStaff.ToString())
            .Replace("{{TEMPORARY_STAFF}}", temporaryCount.ToString())
            .Replace("{{OCCUPANCY_RATE}}", occupancyRate.ToString("0"))
            .Replace("{{ROWS}}", tableRows.ToString())
            .Replace("{{GENERATION_DATE}}", DateTime.Now.ToString("dd/MM/yyyy HH:mm"));

        var fileName = $"planning-{serviceId}-{planning.WeekStart:yyyyMMdd}.html";
        return (fileName, htmlContent);
    }

    private static string HtmlEncode(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&#39;");
    }

    private static string GetEmbeddedHtmlTemplate()
    {
        // Template HTML minimal intégré (version simplifiée)
        return @"<!DOCTYPE html>
<html lang=""fr"">
<head>
    <meta charset=""UTF-8"">
    <title>CLINISYSY - Planning Médical</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', 'Roboto', Arial, sans-serif; background: #F8FAFC; color: #34495E; padding: 24px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 24px; border-radius: 8px; }
        .header { display: flex; justify-content: space-between; padding-bottom: 20px; border-bottom: 3px solid #0066A0; margin-bottom: 24px; }
        .logo { width: 56px; height: 56px; background: linear-gradient(135deg, #0066A0, #2C3E50); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
        h1 { font-size: 18pt; color: #0066A0; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #F5F7FA; padding: 16px; border-radius: 8px; border-left: 4px solid #0066A0; }
        .stat-value { font-size: 24pt; font-weight: 700; color: #2C3E50; }
        .stat-label { font-size: 9pt; color: #7F8C8D; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; }
        thead { background: linear-gradient(135deg, #0066A0, #2C3E50); color: white; }
        thead th { padding: 12px; text-align: left; font-weight: 600; }
        tbody tr:nth-child(even) { background: #F9F9F9; }
        tbody td { padding: 10px; border-bottom: 1px solid #E0E0E0; }
        .shift-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 9pt; font-weight: 600; }
        .shift-jour { background: #D6EAF8; color: #1A5490; }
        .shift-nuit { background: #2C3E50; color: #FFFFFF; }
        .shift-garde { background: #FDEBD0; color: #BA6E00; }
    </style>
</head>
<body>
    <div class=""container"">
        <div class=""header"">
            <div><div class=""logo"">CS</div></div>
            <div><h1>PLANNING - {{SERVICE_NAME}}</h1><p>{{WEEK_START}} → {{WEEK_END}}</p></div>
        </div>
        <div class=""stats"">
            <div class=""stat-card""><div class=""stat-value"">{{TOTAL_ASSIGNMENTS}}</div><div class=""stat-label"">Affectations</div></div>
            <div class=""stat-card""><div class=""stat-value"">{{ACTIVE_STAFF}}</div><div class=""stat-label"">Personnel</div></div>
            <div class=""stat-card""><div class=""stat-value"">{{TEMPORARY_STAFF}}</div><div class=""stat-label"">Temporaire</div></div>
            <div class=""stat-card""><div class=""stat-value"">{{OCCUPANCY_RATE}}%</div><div class=""stat-label"">Occupation</div></div>
        </div>
        <table>
            <thead><tr><th>Date</th><th>Jour</th><th>Utilisateur</th><th>ID</th><th>Type</th><th>Poste</th><th>Horaire</th><th>Note</th></tr></thead>
            <tbody>{{ROWS}}</tbody>
        </table>
        <div style=""margin-top: 24px; padding-top: 20px; border-top: 2px solid #E0E0E0; font-size: 8pt; color: #95A5A6;"">
            <p>Généré le {{GENERATION_DATE}} · © 2026 CLINISYSY · Document confidentiel</p>
        </div>
    </div>
</body>
</html>";
    }

    private static List<ExportAssignmentRow> BuildExportRows(PlanningData planning, IReadOnlyDictionary<string, string> personnelNames)
    {
        return planning.Assignments
            .OrderBy(a => a.Day)
            .ThenBy(a => a.PersonnelId)
            .Select(item =>
            {
                var dayDate = planning.WeekStart.AddDays(Math.Clamp(item.Day, 0, 366));
                var hasResolvedName = personnelNames.TryGetValue(item.PersonnelId, out var resolvedName)
                    && !string.IsNullOrWhiteSpace(resolvedName)
                    && !string.Equals(resolvedName, item.PersonnelId, StringComparison.OrdinalIgnoreCase);

                var userName = hasResolvedName
                    ? resolvedName!
                    : (item.PersonnelId.All(char.IsDigit) ? "Personnel temporaire" : "Poste vacant");

                var note = item.Note ?? string.Empty;
                if (!hasResolvedName && item.PersonnelId.All(char.IsDigit))
                {
                    note = string.IsNullOrWhiteSpace(note)
                        ? $"ID {item.PersonnelId} - Personnel temporaire"
                        : $"{note} | ID {item.PersonnelId} - Personnel temporaire";
                }
                var schedule = !string.IsNullOrWhiteSpace(item.StartTime) || !string.IsNullOrWhiteSpace(item.EndTime)
                    ? $"{item.StartTime ?? "-"} - {item.EndTime ?? "-"}"
                    : "-";

                return new ExportAssignmentRow
                {
                    Date = dayDate.ToString("yyyy-MM-dd"),
                    DayName = dayDate.ToString("dddd", CultureInfo.GetCultureInfo("fr-FR")),
                    UserName = userName,
                    PersonnelId = item.PersonnelId,
                    ServiceName = planning.ServiceName,
                    ShiftType = NormalizeShiftLabel(item.ShiftType),
                    Poste = item.PosteLabel ?? item.PosteId ?? "-",
                    Schedule = schedule,
                    Note = note
                };
            })
            .ToList();
    }

    private static byte[] BuildSimplePdf(PlanningData planning, IReadOnlyList<ExportAssignmentRow> rows)
    {
        var generatedAt = DateTime.Now;
        var pageStream = BuildPdfPageContent(
            planning,
            rows,
            1,
            1,
            rows.Count,
            generatedAt);

        var sb = new StringBuilder();
        var offsets = new List<int> { 0 };

        sb.Append("%PDF-1.4\n");

        AddPdfObject(sb, offsets, 1, "<< /Type /Catalog /Pages 2 0 R >>");
        AddPdfObject(sb, offsets, 2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
        AddPdfObject(sb, offsets, 3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>");
        AddPdfObject(sb, offsets, 4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
        AddPdfObject(sb, offsets, 5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>");
        AddPdfObject(sb, offsets, 6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

        var contentBytes = Encoding.ASCII.GetBytes(pageStream);
        offsets.Add(Encoding.ASCII.GetByteCount(sb.ToString()));
        sb.Append($"7 0 obj\n<< /Length {contentBytes.Length} >>\nstream\n");
        sb.Append(pageStream);
        sb.Append("endstream\nendobj\n");

        var xrefPosition = Encoding.ASCII.GetByteCount(sb.ToString());
        sb.Append($"xref\n0 {offsets.Count}\n");
        sb.Append("0000000000 65535 f \n");
        for (var i = 1; i < offsets.Count; i++)
        {
            sb.Append($"{offsets[i]:D10} 00000 n \n");
        }

        sb.Append("trailer\n");
        sb.Append($"<< /Size {offsets.Count} /Root 1 0 R >>\n");
        sb.Append("startxref\n");
        sb.Append($"{xrefPosition}\n");
        sb.Append("%%EOF");

        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    private static string BuildWeeklyGridPdf(
        PlanningData planning,
        IReadOnlyList<ExportAssignmentRow> rows,
        DateTime generatedAt)
    {
        var serviceName = rows.FirstOrDefault()?.ServiceName ?? planning.ServiceName ?? "Planning Médical";
        DateTime minDate = rows.Count > 0 
            ? rows.Select(r => DateTime.ParseExact(r.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture)).Min() 
            : planning.WeekStart;
        DateTime maxDate = rows.Count > 0 
            ? rows.Select(r => DateTime.ParseExact(r.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture)).Max() 
            : planning.WeekEnd;
        var period = $"{minDate:dd/MM} → {maxDate:dd/MM/yyyy}";

        // Group assignments by day and shift type
        var dayColumns = new Dictionary<string, Dictionary<string, List<ExportAssignmentRow>>>();
        var shiftTypes = new[] { "Matin", "Après-midi", "Nuit", "Garde", "Astreinte", "Repos", "Formation" };
        
        foreach (var row in rows)
        {
            var dayKey = row.DayName;
            if (!dayColumns.ContainsKey(dayKey))
            {
                dayColumns[dayKey] = new Dictionary<string, List<ExportAssignmentRow>>();
                foreach (var st in shiftTypes)
                {
                    dayColumns[dayKey][st] = new List<ExportAssignmentRow>();
                }
            }

            var shiftKey = row.ShiftType ?? "Autre";
            if (!dayColumns[dayKey].ContainsKey(shiftKey))
            {
                dayColumns[dayKey][shiftKey] = new List<ExportAssignmentRow>();
            }
            dayColumns[dayKey][shiftKey].Add(row);
        }

        // Get week days in order
        var weekDays = new List<string> { "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche" };
        var activeStaff = planning.Assignments?.Select(a => a.PersonnelId).Distinct().Count() ?? 0;
        var temporaryCount = planning.Assignments?.Count(a => a.PersonnelId?.StartsWith("temp_") == true || int.TryParse(a.PersonnelId ?? "", out _)) ?? 0;
        var occupancyRate = planning.Assignments?.Count() > 0 ? Math.Round((double)activeStaff / Math.Max(1, planning.Assignments.Count) * 100, 1) : 0;

        var sb = new StringBuilder();
        sb.Append("BT\n");

        // Header
        sb.Append("0.145 0.388 0.922 rg 30 565 100 25 re f\n");
        sb.Append("0 0 0 rg /F1 20 Tf 75 575 Td (CL) Tj\n");
        sb.Append("0 0 0 rg /F1 16 Tf 145 578 Td (PLANNING HEBDOMADAIRE) Tj\n");
        sb.Append("/F2 11 Tf 145 563 Td (Service: " + PdfText(serviceName) + ") Tj\n");
        sb.Append("/F3 10 Tf 620 578 Td (Periode: " + PdfText(period) + ") Tj\n");
        sb.Append("/F3 9 Tf 620 566 Td (Ref: PLAN-2025-001) Tj\n");
        sb.Append("/F3 8 Tf 620 554 Td (Version: 1.0) Tj\n");

        // KPI Cards
        var kpiY = 510;
        var kpiCards = new[]
        {
            ("Total Affectations", rows.Count.ToString(), "0.145 0.388 0.922"),
            ("Personnel Actif", activeStaff.ToString(), "0.133 0.698 0.298"),
            ("Temporaire", temporaryCount.ToString(), "1 0.596 0"),
            ("Taux d'occupation", occupancyRate.ToString("0.0") + "%", "0.6 0.2 0.8")
        };

        var kpiX = 30;
        foreach (var (label, value, rgb) in kpiCards)
        {
            sb.Append($"{rgb} rg {kpiX} {kpiY} 180 35 re f\n");
            sb.Append($"0 0 0 rg /F1 11 Tf {kpiX + 8} {kpiY + 18} Td ({PdfText(value)}) Tj\n");
            sb.Append($"/F3 8 Tf {kpiX + 8} {kpiY + 6} Td ({PdfText(label)}) Tj\n");
            kpiX += 193;
        }

        // Weekly Grid Table
        var tableTop = kpiY - 15;
        var colWidth = 112; // 7 columns: (812 - 30) / 7 = 112px
        var headerY = tableTop;

        // Day headers
        sb.Append("0.145 0.388 0.922 rg 30 " + headerY + " 782 20 re f\n");
        var colX = 30;
        foreach (var day in weekDays)
        {
            sb.Append($"1 1 1 rg /F1 9 Tf {colX + 5} {headerY + 5} Td ({day}) Tj\n");
            colX += colWidth;
        }

        // Shift type rows
        var rowY = headerY - 20;
        var rowHeight = 55;

        foreach (var shiftType in shiftTypes)
        {
            // Shift label column
            var shiftColor = GetShiftTypeColor(shiftType);
            
            colX = 30;
            foreach (var day in weekDays)
            {
                sb.Append($"{shiftColor} rg {colX} {rowY} {colWidth} {rowHeight} re f\n");
                sb.Append($"0 0 0 RG 0.5 w {colX} {rowY} {colWidth} {rowHeight} re S\n");

                // Get assignments for this day/shift
                if (dayColumns.ContainsKey(day) && dayColumns[day].ContainsKey(shiftType))
                {
                    var assignments = dayColumns[day][shiftType];
                    var textY = rowY + rowHeight - 10;
                    
                    // Shift type label
                    sb.Append($"0 0 0 rg /F1 8 Tf {colX + 3} {textY} Td ({shiftType}) Tj\n");
                    textY -= 10;

                    // Staff names (max 4)
                    foreach (var assignment in assignments.Take(4))
                    {
                        var userName = assignment.UserName?.Length > 15 
                            ? assignment.UserName.Substring(0, 13) + ".." 
                            : assignment.UserName;
                        sb.Append($"/F3 7 Tf {colX + 3} {textY} Td ({PdfText(userName ?? "")}) Tj\n");
                        textY -= 9;
                    }

                    if (assignments.Count > 4)
                    {
                        sb.Append($"/F3 6 Tf {colX + 3} {textY} Td (+{assignments.Count - 4} autres) Tj\n");
                    }
                }
                else
                {
                    // Empty cell - just show shift type
                    sb.Append($"0.5 0.5 0.5 rg /F3 7 Tf {colX + 3} {rowY + rowHeight - 12} Td ({shiftType}) Tj\n");
                }

                colX += colWidth;
            }

            rowY -= rowHeight;
        }

        // Legend
        var legendY = 75;
        sb.Append("0 0 0 rg /F1 10 Tf 30 " + legendY + " Td (POSTES / LEGENDE:) Tj\n");

        var legendShifts = new[]
        {
            ("Matin", "0.678 0.847 0.902"),
            ("Apres-midi", "0.8 0.9 0.95"),
            ("Nuit", "0.4 0.4 0.5"),
            ("Garde", "1 0.8 0.6"),
            ("Astreinte", "1 1 0.8"),
            ("Repos", "0.9 0.9 0.9"),
            ("Formation", "0.847 0.749 0.847")
        };

        var legendX = 30;
        var legendBoxY = legendY - 16;
        foreach (var (type, rgb) in legendShifts)
        {
            var typeDisplay = type.Length > 10 ? type.Substring(0, 8) + ".." : type;
            sb.Append($"{rgb} rg {legendX} {legendBoxY} 15 10 re f\n");
            sb.Append($"0 0 0 RG 0.5 w {legendX} {legendBoxY} 15 10 re S\n");
            sb.Append($"0 0 0 rg /F3 7 Tf {legendX + 18} {legendBoxY + 2} Td ({typeDisplay}) Tj\n");
            legendX += 85;
        }

        // Footer
        var footerY = 35;
        sb.Append($"0 0 0 rg /F3 8 Tf 30 {footerY + 10} Td (Signature Chef de Service: ________________) Tj\n");
        sb.Append($"/F3 8 Tf 350 {footerY + 10} Td (Signature Cadre: ________________) Tj\n");
        sb.Append($"/F3 7 Tf 30 {footerY - 5} Td (Genere le: {generatedAt:dd/MM/yyyy HH:mm}) Tj\n");
        sb.Append($"/F3 7 Tf 700 {footerY - 5} Td (Page 1/1) Tj\n");
        sb.Append($"/F3 6 Tf 30 {footerY - 15} Td (Document confidentiel - Usage interne uniquement) Tj\n");

        sb.Append("ET\n");
        return sb.ToString();
    }

    private static string BuildPdfPageContent(
        PlanningData planning,
        IReadOnlyList<ExportAssignmentRow> pageRows,
        int pageNumber,
        int totalPages,
        int totalAssignments,
        DateTime generatedAt)
    {
        static string N(double value) => value.ToString("0.###", CultureInfo.InvariantCulture);

        const double pageWidth = 842;
        const double pageHeight = 595;
        const double margin = 42;
        var contentWidth = pageWidth - (margin * 2);

        var reference = $"PL-{RemoveDiacritics(planning.ServiceId).ToUpperInvariant()}-{planning.WeekStart:yyyyMMdd}";
        var content = new StringBuilder();
        var weekDays = Enumerable
            .Range(0, Math.Max(1, planning.WeekEnd.Subtract(planning.WeekStart).Days + 1))
            .Select(offset => planning.WeekStart.AddDays(offset))
            .Select(day => day.ToString("ddd dd/MM", CultureInfo.GetCultureInfo("fr-FR")))
            .ToList();

        void FillRect(double x, double y, double w, double h, double r, double g, double b)
            => content.AppendLine($"q {N(r)} {N(g)} {N(b)} rg {N(x)} {N(y)} {N(w)} {N(h)} re f Q");

        void StrokeRect(double x, double y, double w, double h, double lineWidth, double r, double g, double b)
            => content.AppendLine($"q {N(lineWidth)} w {N(r)} {N(g)} {N(b)} RG {N(x)} {N(y)} {N(w)} {N(h)} re S Q");

        void DrawText(string font, double size, double x, double y, string text, double r = 0.1, double g = 0.1, double b = 0.1)
        {
            content.AppendLine("BT");
            content.AppendLine($"/{font} {N(size)} Tf");
            content.AppendLine($"{N(r)} {N(g)} {N(b)} rg");
            content.AppendLine($"1 0 0 1 {N(x)} {N(y)} Tm");
            content.AppendLine($"({PdfText(text)}) Tj");
            content.AppendLine("ET");
        }

        (double R, double G, double B) ShiftColor(string shift)
            => (shift ?? string.Empty).ToLowerInvariant() switch
            {
                "jour" => (0.859, 0.918, 0.996),
                "nuit" => (0.118, 0.161, 0.231),
                "garde" => (0.996, 0.843, 0.667),
                "astreinte" => (0.996, 0.976, 0.765),
                "repos" => (0.945, 0.961, 0.976),
                "formation" => (0.953, 0.91, 0.996),
                _ => (0.945, 0.961, 0.976)
            };

        var topY = pageHeight - margin;
        var headerHeight = 118d;
        var headerY = topY - headerHeight;
        FillRect(margin, headerY, contentWidth, headerHeight, 0.973, 0.984, 0.996);
        StrokeRect(margin, headerY, contentWidth, headerHeight, 0.8, 0.878, 0.91, 0.941);

        FillRect(margin + 14, headerY + 56, 38, 38, 0.145, 0.388, 0.922);
        DrawText("F2", 11, margin + 23, headerY + 72, "CL", 1, 1, 1);

        DrawText("F1", 18, margin + 62, headerY + 86, "CLINISYSY", 0.114, 0.227, 0.541);
        DrawText("F3", 10, margin + 62, headerY + 70, "Planning medical - Modele PDF V3", 0.392, 0.455, 0.529);
        DrawText("F1", 20, margin + 62, headerY + 42, "PLANNING HEBDOMADAIRE", 0.145, 0.388, 0.922);
        DrawText("F2", 13, margin + 62, headerY + 24, $"Service {planning.ServiceName}", 0.118, 0.161, 0.231);

        var metaX = margin + contentWidth - 248;
        FillRect(metaX, headerY + 56, 234, 40, 1, 1, 1);
        StrokeRect(metaX, headerY + 56, 234, 40, 0.7, 0.878, 0.91, 0.941);
        DrawText("F3", 9, metaX + 10, headerY + 80, $"Reference : {reference}", 0.392, 0.455, 0.529);
        DrawText("F3", 9, metaX + 10, headerY + 66, "Version : 2.0", 0.392, 0.455, 0.529);
        DrawText("F3", 10, metaX, headerY + 38, $"Periode : {planning.WeekStart:dd/MM/yyyy} au {planning.WeekEnd:dd/MM/yyyy}", 0.118, 0.161, 0.231);
        DrawText("F3", 9, metaX, headerY + 24, "Chef de service : Dr. Martin DUPONT", 0.392, 0.455, 0.529);
        DrawText("F3", 9, metaX, headerY + 12, $"Genere le : {generatedAt:dd/MM/yyyy HH:mm}", 0.392, 0.455, 0.529);
        FillRect(margin, headerY - 4, contentWidth, 2, 0.145, 0.388, 0.922);
        DrawText("F3", 8.8, margin + 62, headerY - 16, $"Jours: {string.Join(" | ", weekDays)}", 0.392, 0.455, 0.529);

        var kpiY = headerY - 86;
        var cardGap = 10d;
        var cardWidth = (contentWidth - (cardGap * 3)) / 4;
        var dayCount = Math.Max(1, planning.WeekEnd.Subtract(planning.WeekStart).Days + 1);
        var occupancyRate = Math.Clamp((int)Math.Round((totalAssignments / (double)(dayCount * 4)) * 100), 0, 100);
        var kpis = new (string Value, string Label)[]
        {
            ($"{totalAssignments}", "Affectations totales"),
            ($"{pageRows.Select(r => r.UserName).Distinct(StringComparer.OrdinalIgnoreCase).Count()}", "Personnel (page)"),
            ($"{pageRows.Count(r => string.Equals(r.UserName, "Personnel temporaire", StringComparison.OrdinalIgnoreCase))}", "Temporaire (page)"),
            ($"{occupancyRate}%", "Taux occupation")
        };

        for (var i = 0; i < kpis.Length; i++)
        {
            var x = margin + i * (cardWidth + cardGap);
            FillRect(x, kpiY, cardWidth, 64, 1, 1, 1);
            StrokeRect(x, kpiY, cardWidth, 64, 0.7, 0.878, 0.91, 0.941);
            DrawText("F1", 16, x + 12, kpiY + 38, kpis[i].Value, 0.118, 0.161, 0.231);
            DrawText("F3", 9, x + 12, kpiY + 20, kpis[i].Label, 0.392, 0.455, 0.529);
        }

        var tableTop = kpiY - 14;
        var headerRowHeight = 22d;
        var legendY = margin + 58;
        var availableTableHeight = tableTop - (legendY + 64);
        var rowHeight = Math.Max(13d, Math.Min(21d, (availableTableHeight - headerRowHeight) / Math.Max(pageRows.Count, 1)));
        var tableHeight = headerRowHeight + (rowHeight * pageRows.Count);
        var tableY = tableTop - tableHeight;

        var colDate = 78d;
        var colDay = 82d;
        var colUser = 190d;
        var colType = 88d;
        var colPoste = 220d;
        var colHoraire = contentWidth - (colDate + colDay + colUser + colType + colPoste);

        FillRect(margin, tableTop - headerRowHeight, contentWidth, headerRowHeight, 0.933, 0.949, 1);
        StrokeRect(margin, tableY, contentWidth, tableHeight, 0.8, 0.878, 0.91, 0.941);

        var columns = new (string Label, double Width)[]
        {
            ("Date", colDate),
            ("Jour", colDay),
            ("Utilisateur", colUser),
            ("Type", colType),
            ("Poste", colPoste),
            ("Horaire", colHoraire)
        };

        double cursorX = margin;
        foreach (var column in columns)
        {
            DrawText("F1", 10, cursorX + 6, tableTop - 15, column.Label, 0.118, 0.161, 0.231);
            cursorX += column.Width;
            StrokeRect(cursorX, tableY, 0, tableHeight, 0.6, 0.878, 0.91, 0.941);
        }

        for (var i = 0; i < pageRows.Count; i++)
        {
            var row = pageRows[i];
            var rowY = tableTop - headerRowHeight - ((i + 1) * rowHeight);

            if (i % 2 == 1)
            {
                FillRect(margin, rowY, contentWidth, rowHeight, 0.973, 0.98, 0.988);
            }

            var typeColor = ShiftColor(row.ShiftType);
            FillRect(margin + colDate + colDay + colUser + 2, rowY + 2, colType - 4, rowHeight - 4, typeColor.R, typeColor.G, typeColor.B);

            var textY = rowY + 7;
            DrawText("F3", 9, margin + 6, textY, row.Date, 0.118, 0.161, 0.231);
            DrawText("F3", 9, margin + colDate + 6, textY, row.DayName, 0.118, 0.161, 0.231);
            DrawText("F2", 9, margin + colDate + colDay + 6, textY, row.UserName, 0.118, 0.161, 0.231);

            var typeTextColor = row.ShiftType.Equals("Nuit", StringComparison.OrdinalIgnoreCase)
                ? (R: 1d, G: 1d, B: 1d)
                : (R: 0.118d, G: 0.161d, B: 0.231d);
            DrawText("F2", 9, margin + colDate + colDay + colUser + 8, textY, row.ShiftType, typeTextColor.R, typeTextColor.G, typeTextColor.B);

            DrawText("F3", 9, margin + colDate + colDay + colUser + colType + 6, textY, row.Poste, 0.118, 0.161, 0.231);
            DrawText("F3", 9, margin + colDate + colDay + colUser + colType + colPoste + 6, textY, row.Schedule, 0.118, 0.161, 0.231);

            StrokeRect(margin, rowY, contentWidth, 0, 0.6, 0.878, 0.91, 0.941);
        }

        FillRect(margin, legendY, contentWidth, 50, 1, 1, 1);
        StrokeRect(margin, legendY, contentWidth, 50, 0.7, 0.878, 0.91, 0.941);
        DrawText("F2", 10, margin + 8, legendY + 34, "POSTES / LEGENDE", 0.118, 0.161, 0.231);

        var legendItems = new[] { "Jour", "Nuit", "Garde", "Astreinte", "Repos", "Formation" };
        for (var i = 0; i < legendItems.Length; i++)
        {
            var lx = margin + 8 + (i * 122);
            var color = ShiftColor(legendItems[i]);
            FillRect(lx, legendY + 18, 10, 10, color.R, color.G, color.B);
            StrokeRect(lx, legendY + 18, 10, 10, 0.4, 0.753, 0.796, 0.851);
            DrawText("F3", 8.5, lx + 15, legendY + 20, legendItems[i], 0.118, 0.161, 0.231);
        }

        DrawText("F3", 8, margin + 8, legendY + 6, "Types de postes en bas de page : Jour, Nuit, Garde, Astreinte, Repos, Formation", 0.392, 0.455, 0.529);

        var footerY = margin;
        StrokeRect(margin, footerY + 34, contentWidth, 0, 0.8, 0.878, 0.91, 0.941);
        DrawText("F3", 8.5, margin, footerY + 22, "______________________________", 0.392, 0.455, 0.529);
        DrawText("F3", 8.5, margin, footerY + 10, "Signature chef de service", 0.392, 0.455, 0.529);

        DrawText("F3", 8.5, margin + 290, footerY + 22, "______________________________", 0.392, 0.455, 0.529);
        DrawText("F3", 8.5, margin + 290, footerY + 10, "Signature direction RH", 0.392, 0.455, 0.529);

        DrawText("F3", 8, margin + contentWidth - 290, footerY + 22, $"Genere le {generatedAt:dd/MM/yyyy HH:mm} · Page {pageNumber}/{totalPages}", 0.392, 0.455, 0.529);
        DrawText("F3", 8, margin + contentWidth - 290, footerY + 10, "© 2026 Clinique Saint-Luc · Document confidentiel", 0.392, 0.455, 0.529);

        return content.ToString();
    }

    private static void WriteExcelRow(StringBuilder sb, IEnumerable<string?> values, string? styleId = null)
    {
        sb.AppendLine("      <Row>");
        foreach (var value in values)
        {
            var stylePart = string.IsNullOrWhiteSpace(styleId) ? string.Empty : $" ss:StyleID=\"{styleId}\"";
            sb.AppendLine($"        <Cell{stylePart}><Data ss:Type=\"String\">{Xml(value)}</Data></Cell>");
        }
        sb.AppendLine("      </Row>");
    }

    private static string Csv(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        return $"\"{value.Replace("\"", "\"\"")}\"";
    }

    private static string Xml(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
    }

    private static string PdfText(string input)
    {
        var safe = RemoveDiacritics(input ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("(", "\\(")
            .Replace(")", "\\)");

        return safe;
    }

    private static string RemoveDiacritics(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);

        foreach (var c in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category != UnicodeCategory.NonSpacingMark && c <= 127)
            {
                sb.Append(c);
            }
        }

        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    private static string Pad(string? value, int maxLength)
    {
        var normalized = RemoveDiacritics(value ?? string.Empty);
        var trimmed = normalized.Length > maxLength ? normalized[..maxLength] : normalized;
        return trimmed.PadRight(maxLength);
    }

    private sealed class ExportAssignmentRow
    {
        public string Date { get; init; } = string.Empty;
        public string DayName { get; init; } = string.Empty;
        public string UserName { get; init; } = string.Empty;
        public string PersonnelId { get; init; } = string.Empty;
        public string ServiceName { get; init; } = string.Empty;
        public string ShiftType { get; init; } = string.Empty;
        public string Poste { get; init; } = string.Empty;
        public string Schedule { get; init; } = string.Empty;
        public string Note { get; init; } = string.Empty;
    }
}
