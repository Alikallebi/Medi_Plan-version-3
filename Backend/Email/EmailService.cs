using System.Net;
using System.Net.Mail;

namespace Backend.Email;

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

public interface IEmailService
{
    /// <summary>
    /// Envoie un e-mail HTML. Fire-and-forget safe : les erreurs sont loguées sans lever d'exception.
    /// </summary>
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPLÉMENTATION SMTP (Gmail / tout serveur SMTP)
// ─────────────────────────────────────────────────────────────────────────────

public sealed class SmtpEmailService : IEmailService
{
    private readonly EmailSettings _settings;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IConfiguration configuration, ILogger<SmtpEmailService> logger)
    {
        _settings = configuration.GetSection("Email").Get<EmailSettings>() ?? new EmailSettings();
        _logger   = logger;
    }

    public async Task SendAsync(string toEmail, string toName, string subject, string htmlBody)
    {
        if (string.IsNullOrWhiteSpace(toEmail))
            return;

        if (string.IsNullOrWhiteSpace(_settings.Password))
        {
            Console.WriteLine($"[Email] BLOQUÉ — mot de passe SMTP vide, email non envoyé à {toEmail}");
            _logger.LogWarning("[Email] Mot de passe SMTP non configuré — e-mail non envoyé à {Email}.", toEmail);
            return;
        }

        Console.WriteLine($"[Email] Tentative SMTP → {toEmail} | Sujet: {subject} | Host: {_settings.SmtpHost}:{_settings.SmtpPort} SSL={_settings.EnableSsl}");

        try
        {
            using var client = new SmtpClient(_settings.SmtpHost, _settings.SmtpPort)
            {
                Credentials  = new NetworkCredential(_settings.SenderEmail, _settings.Password),
                EnableSsl    = _settings.EnableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            using var message = new MailMessage
            {
                From       = new MailAddress(_settings.SenderEmail, _settings.SenderName),
                Subject    = subject,
                Body       = htmlBody,
                IsBodyHtml = true
            };
            message.To.Add(new MailAddress(toEmail, toName));

            await client.SendMailAsync(message);
            Console.WriteLine($"[Email] ✅ Envoyé avec succès à {toEmail}");
            _logger.LogInformation("[Email] Envoyé à {Email} — {Subject}", toEmail, subject);
        }
        catch (Exception ex)
        {
            // On logue mais on ne propage pas : l'e-mail est best-effort
            Console.WriteLine($"[Email] ❌ Échec SMTP à {toEmail} — {ex.GetType().Name}: {ex.Message}");
            _logger.LogWarning(ex, "[Email] Échec d'envoi à {Email} — {Subject}", toEmail, subject);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION (section "Email" dans appsettings.json)
// ─────────────────────────────────────────────────────────────────────────────

public sealed class EmailSettings
{
    public string SmtpHost    { get; set; } = "smtp.gmail.com";
    public int    SmtpPort    { get; set; } = 587;
    public bool   EnableSsl   { get; set; } = true;
    public string SenderEmail { get; set; } = "";
    public string SenderName  { get; set; } = "Clinisys";
    public string Password    { get; set; } = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES HTML D'E-MAILS
// ─────────────────────────────────────────────────────────────────────────────

public static class EmailTemplates
{
    // ── Layout principal ──────────────────────────────────────────────────────
    // accentColor : couleur HEX de la bannière (ex. "#2563eb")
    // icon        : emoji affiché dans la bannière
    private static string Wrap(string title, string accentColor, string icon, string body) =>
        "<!DOCTYPE html>" +
        "<html lang=\"fr\">" +
        "<head>" +
        "<meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
        $"<title>{title} — Clinisys</title>" +
        "</head>" +
        "<body style=\"margin:0;padding:0;background-color:#edf2f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">" +
        // wrapper
        "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"background:#edf2f7;padding:40px 16px;\">" +
        "<tr><td align=\"center\">" +
        "<table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" role=\"presentation\" style=\"max-width:600px;width:100%;\">" +

        // ── HEADER LOGO ──────────────────────────────────────────────────────
        "<tr>" +
        "<td style=\"background:linear-gradient(135deg,#0f2557 0%,#1a3da8 55%,#4a6ff5 100%);" +
        "border-radius:16px 16px 0 0;padding:26px 36px;\">" +
        "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" +
        "<tr>" +
        // icône hôpital
        "<td style=\"vertical-align:middle;width:54px;\">" +
        "<div style=\"width:50px;height:50px;background:rgba(255,255,255,0.15);" +
        "border-radius:12px;text-align:center;line-height:50px;font-size:26px;\">🏥</div>" +
        "</td>" +
        // nom + baseline
        "<td style=\"padding-left:14px;vertical-align:middle;\">" +
        "<div style=\"color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;\">Clinisys</div>" +
        "<div style=\"color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:1px;" +
        "text-transform:uppercase;margin-top:3px;\">Gestion des Plannings Hospitaliers</div>" +
        "</td>" +
        // date courante
        "<td style=\"text-align:right;vertical-align:middle;\">" +
        $"<div style=\"color:rgba(255,255,255,0.50);font-size:11px;\">{DateTime.Now:dd MMMM yyyy}</div>" +
        "</td>" +
        "</tr></table>" +
        "</td></tr>" +

        // ── BANNIÈRE TYPE ─────────────────────────────────────────────────────
        "<tr>" +
        $"<td style=\"background:{accentColor};padding:22px 36px;text-align:center;\">" +
        $"<div style=\"font-size:34px;line-height:1;\">{icon}</div>" +
        $"<div style=\"color:#ffffff;font-size:17px;font-weight:700;margin-top:10px;letter-spacing:0.3px;\">{title}</div>" +
        "</td></tr>" +

        // ── CORPS ─────────────────────────────────────────────────────────────
        "<tr>" +
        "<td style=\"background:#ffffff;padding:36px 36px 28px;\">" +
        body +
        "</td></tr>" +

        // ── SÉPARATEUR + FOOTER ───────────────────────────────────────────────
        "<tr>" +
        "<td style=\"background:#f9fafb;border-top:1px solid #e5e7eb;" +
        "border-radius:0 0 16px 16px;padding:22px 36px;text-align:center;\">" +
        "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" +
        "<tr><td style=\"text-align:center;padding-bottom:12px;\">" +
        "<span style=\"display:inline-block;width:32px;height:32px;background:#eef2f7;" +
        "border-radius:8px;line-height:32px;font-size:16px;\">🏥</span>" +
        "</td></tr>" +
        "<tr><td style=\"text-align:center;\">" +
        "<div style=\"color:#6b7280;font-size:12px;line-height:1.9;\">" +
        "<strong style=\"color:#374151;\">Clinisys</strong> &nbsp;·&nbsp; Système de gestion des plannings hospitaliers<br>" +
        "Cet e-mail est généré automatiquement — merci de ne pas y répondre.<br>" +
        "<span style=\"color:#d1d5db;\">© 2026 Clinisys · Tous droits réservés</span>" +
        "</div>" +
        "</td></tr></table>" +
        "</td></tr>" +

        "</table>" +   // inner 600px
        "</td></tr>" +
        "</table>" +   // outer wrapper
        "</body></html>";

    // ── Tableau de données avec lignes alternées ───────────────────────────────
    private static string InfoTable(params (string Label, string Value)[] rows)
    {
        var sb = new System.Text.StringBuilder();
        sb.Append(
            "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" " +
            "style=\"border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;" +
            "margin:20px 0 24px;font-size:14px;\">");
        for (int i = 0; i < rows.Length; i++)
        {
            var bg    = i % 2 == 0 ? "#ffffff" : "#f9fafb";
            var border = i < rows.Length - 1 ? "border-bottom:1px solid #f0f0f0;" : "";
            sb.Append(
                $"<tr style=\"background:{bg};\">" +
                $"<td style=\"padding:11px 16px;color:#6b7280;font-weight:500;" +
                $"width:42%;{border}\">{rows[i].Label}</td>" +
                $"<td style=\"padding:11px 16px;color:#111827;font-weight:700;{border}\">{rows[i].Value}</td>" +
                "</tr>");
        }
        sb.Append("</table>");
        return sb.ToString();
    }

    // ── Bouton CTA centré ─────────────────────────────────────────────────────
    private static string Cta(string href, string label, string color) =>
        "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:24px 0 6px;\">" +
        "<tr><td align=\"center\">" +
        $"<a href=\"{href}\" style=\"display:inline-block;background:{color};color:#ffffff;" +
        "text-decoration:none;padding:14px 40px;border-radius:9px;font-size:15px;" +
        $"font-weight:700;letter-spacing:0.4px;\">{label}</a>" +
        "</td></tr></table>";

    // ── Style paragraphe partagé ──────────────────────────────────────────────
    private const string Ps = "style=\"margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;\"";

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Soumission — envoyé au responsable de la 1ʳᵉ étape
    // ─────────────────────────────────────────────────────────────────────────
    public static string ValidationDemandee(
        string validatorName, string serviceName, string weekLabel,
        string soumisParNom, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{validatorName}</strong>,</p>" +
            $"<p {Ps}>Un nouveau planning a été soumis et nécessite <strong>votre validation</strong> " +
            "pour avancer dans le circuit d'approbation.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",    serviceName),
                ("📅&nbsp; Semaine",    weekLabel),
                ("👤&nbsp; Soumis par", soumisParNom)) +
            $"<p {Ps}>Connectez-vous à Clinisys pour <strong>approuver ou rejeter</strong> ce planning dans les meilleurs délais.</p>" +
            Cta($"http://localhost:4200{lien}", "Examiner le planning →", "#2563eb");
        return Wrap("Planning en attente de validation", "#2563eb", "📋", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Avancement d'étape — envoyé au responsable de l'étape suivante
    // ─────────────────────────────────────────────────────────────────────────
    public static string EtapeApprouvee(
        string validatorName, string serviceName, string weekLabel,
        string validePar, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{validatorName}</strong>,</p>" +
            $"<p {Ps}>Le planning ci-dessous a franchi l'étape précédente avec succès. " +
            "Il est désormais en attente de <strong>votre approbation</strong>.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",                    serviceName),
                ("📅&nbsp; Semaine",                    weekLabel),
                ("✅&nbsp; Étape précédente validée par", validePar)) +
            $"<p {Ps}>Votre validation est indispensable pour que le planning puisse continuer son parcours d'approbation.</p>" +
            Cta($"http://localhost:4200{lien}", "Valider maintenant →", "#7c3aed");
        return Wrap("Votre validation est requise", "#7c3aed", "⚡", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Progression — envoyé au créateur pour l'informer de l'avancement
    // ─────────────────────────────────────────────────────────────────────────
    public static string PlanningAvanceEtape(
        string creatorName, string serviceName, string weekLabel,
        int etapeNum, int totalEtapes, string validePar, string lien)
    {
        var pct = (int)Math.Round(etapeNum / (double)totalEtapes * 100);
        var progressBar =
            "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:4px 0 24px;\">" +
            "<tr><td>" +
            "<div style=\"background:#e5e7eb;border-radius:100px;height:10px;overflow:hidden;\">" +
            $"<div style=\"background:linear-gradient(90deg,#4a6ff5,#7c3aed);width:{pct}%;height:10px;border-radius:100px;\"></div>" +
            "</div>" +
            $"<div style=\"text-align:right;font-size:12px;color:#6b7280;margin-top:6px;font-weight:600;\">{pct}% complété</div>" +
            "</td></tr></table>";

        var body =
            $"<p {Ps}>Bonjour <strong>{creatorName}</strong>,</p>" +
            $"<p {Ps}>Bonne nouvelle ! Votre planning a <strong>progressé dans le circuit de validation</strong>.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",     serviceName),
                ("📅&nbsp; Semaine",     weekLabel),
                ("🔢&nbsp; Avancement",  $"Étape {etapeNum} / {totalEtapes}"),
                ("✅&nbsp; Validée par", validePar)) +
            progressBar +
            $"<p {Ps}>Il est désormais en attente de validation par le responsable de l'étape suivante.</p>" +
            Cta($"http://localhost:4200{lien}", "Suivre l'avancement →", "#4a6ff5");
        return Wrap($"Avancement — étape {etapeNum} / {totalEtapes}", "#4a6ff5", "🔄", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4a. Validation finale — diffusé à tous les agents du service
    // ─────────────────────────────────────────────────────────────────────────
    public static string PlanningValideServiceBroadcast(
        string recipientName, string serviceName, string weekLabel,
        string valideFinal, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{recipientName}</strong>,</p>" +
            $"<p {Ps}>Le planning de votre service a été <strong>entièrement approuvé</strong> " +
            "et est désormais officiel. Vous pouvez le consulter dès maintenant.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",              serviceName),
                ("📅&nbsp; Semaine",              weekLabel),
                ("🏆&nbsp; Validation finale par", valideFinal)) +
            $"<p {Ps}>Ce planning fait désormais foi pour l'organisation du service sur cette période.</p>" +
            Cta($"http://localhost:4200{lien}", "Consulter mon planning →", "#059669");
        return Wrap("Planning officiel validé", "#059669", "🎉", body);
    }

    // conservé pour compatibilité
    public static string PlanningValide(
        string creatorName, string serviceName, string weekLabel,
        string valideFinal, string lien)
        => PlanningValideServiceBroadcast(creatorName, serviceName, weekLabel, valideFinal, lien);

    // ─────────────────────────────────────────────────────────────────────────
    // 4b. Confirmation — envoyé au validateur après son approbation
    // ─────────────────────────────────────────────────────────────────────────
    public static string ConfirmationValidation(
        string validateurNom, string serviceName, string weekLabel,
        string etapeLabel, bool estFinal, string lien)
    {
        var statutMsg = estFinal
            ? "<span style=\"color:#059669;font-weight:700;\">Planning entièrement validé ✅</span>"
            : $"<span style=\"font-weight:700;\">Passage à l'étape suivante</span> ({etapeLabel})";
        var body =
            $"<p {Ps}>Bonjour <strong>{validateurNom}</strong>,</p>" +
            $"<p {Ps}>Votre validation a bien été <strong>enregistrée</strong>. Merci pour votre réactivité.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",  serviceName),
                ("📅&nbsp; Semaine",  weekLabel),
                ("📌&nbsp; Résultat", statutMsg)) +
            $"<p {Ps}>Suite à votre action, le circuit de validation a été mis à jour en conséquence.</p>" +
            Cta($"http://localhost:4200{lien}", "Voir le planning →", "#6366f1");
        return Wrap("Validation enregistrée", "#6366f1", "✅", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Rejet — envoyé au créateur
    // ─────────────────────────────────────────────────────────────────────────
    public static string PlanningRejete(
        string creatorName, string serviceName, string weekLabel,
        string rejetePar, string motif, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{creatorName}</strong>,</p>" +
            $"<p {Ps}>Votre planning a été <strong>rejeté</strong> par un responsable. " +
            "Vous trouverez ci-dessous les détails du rejet.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",    serviceName),
                ("📅&nbsp; Semaine",    weekLabel),
                ("👤&nbsp; Rejeté par", rejetePar),
                ("💬&nbsp; Motif",      motif)) +
            $"<p {Ps}>Veuillez apporter les corrections nécessaires puis resoumettre le planning dès que possible.</p>" +
            Cta($"http://localhost:4200{lien}", "Corriger le planning →", "#dc2626");
        return Wrap("Planning rejeté", "#dc2626", "❌", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Demande de modification — envoyé au créateur
    // ─────────────────────────────────────────────────────────────────────────
    public static string ModificationDemandee(
        string creatorName, string serviceName, string weekLabel,
        string demandePar, string instructions, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{creatorName}</strong>,</p>" +
            $"<p {Ps}>Des <strong>modifications</strong> ont été demandées sur votre planning. " +
            "Veuillez en prendre connaissance et effectuer les corrections nécessaires.</p>" +
            InfoTable(
                ("🏨&nbsp; Service",       serviceName),
                ("📅&nbsp; Semaine",       weekLabel),
                ("👤&nbsp; Demandé par",   demandePar),
                ("📝&nbsp; Instructions",  instructions)) +
            $"<p {Ps}>Une fois les corrections apportées, re-soumettez le planning pour reprendre le circuit de validation.</p>" +
            Cta($"http://localhost:4200{lien}", "Modifier le planning →", "#d97706");
        return Wrap("Modifications demandées", "#d97706", "✏️", body);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Notification de modification — envoyé à l'agent concerné
    // ─────────────────────────────────────────────────────────────────────────
    public static string PlanningModifie(
        string recipientName, string serviceName, string weekLabel, string lien)
    {
        var body =
            $"<p {Ps}>Bonjour <strong>{recipientName}</strong>,</p>" +
            $"<p {Ps}>Votre planning a été <strong>mis à jour</strong> par le responsable de votre service. " +
            "Consultez-le dès maintenant pour prendre connaissance des changements.</p>" +
            InfoTable(
                ("🏨&nbsp; Service", serviceName),
                ("📅&nbsp; Semaine", weekLabel)) +
            $"<p {Ps}>En cas de question concernant ces modifications, veuillez contacter directement votre responsable de service.</p>" +
            Cta($"http://localhost:4200{lien}", "Voir mon planning →", "#0891b2");
        return Wrap("Votre planning a été modifié", "#0891b2", "📅", body);
    }
}
