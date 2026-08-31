using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using InpaAi.Shared;

namespace InpaAi.Copilot
{
    internal sealed class MainForm : Form
    {
        private readonly Color backgroundColor = Color.FromArgb(245, 247, 249);
        private readonly Color panelColor = Color.White;
        private readonly Color primaryColor = Color.FromArgb(22, 96, 136);
        private readonly Color successColor = Color.FromArgb(28, 117, 82);
        private readonly Color warningColor = Color.FromArgb(170, 99, 16);
        private readonly Color errorColor = Color.FromArgb(176, 47, 47);

        private readonly ComboBox providerCombo = new ComboBox();
        private readonly TextBox addressText = new TextBox();
        private readonly Label locationLabel = new Label();
        private readonly Button connectionButton = new Button();
        private readonly Button modelsButton = new Button();
        private readonly ComboBox modelCombo = new ComboBox();
        private readonly ComboBox timeoutCombo = new ComboBox();
        private readonly ComboBox syntheticCombo = new ComboBox();
        private readonly Button loadSyntheticButton = new Button();
        private readonly TextBox promptText = new TextBox();
        private readonly Button analyzeButton = new Button();
        private readonly Button cancelButton = new Button();
        private readonly TextBox diagnosisText = new TextBox();
        private readonly TextBox rawResponseText = new TextBox();
        private readonly Label statusLabel = new Label();
        private readonly Label bridgeStatusLabel = new Label();
        private readonly Button bridgeButton = new Button();
        private readonly Label ms43ProfileStatusLabel = new Label();
        private readonly Label dataModeLabel = new Label();
        private readonly Button importDiagnosticButton = new Button();
        private readonly Button liveAccessButton = new Button();
        private readonly DataGridView catalogGrid = new DataGridView();
        private readonly TextBox catalogSourceText = new TextBox();
        private readonly Label vehicleDiscoveryStatusLabel = new Label();
        private readonly Label reachableCountLabel = new Label();
        private readonly Label diagnosticGroupsLabel = new Label();
        private readonly Button discoveryButton = new Button();
        private readonly Button discoveryCancelButton = new Button();
        private readonly DataGridView discoveryGrid = new DataGridView();

        private readonly SafeSettingsStore settingsStore;
        private readonly BridgeHealthClient bridgeClient;
        private readonly Ms43OfflineProfile offlineProfile;
        private readonly VehicleDiscoverySessionStore vehicleProfileStore =
            new VehicleDiscoverySessionStore();
        private CancellationTokenSource providerCancellation;
        private CancellationTokenSource bridgeCancellation;
        private CancellationTokenSource discoveryCancellation;
        private bool providerBusy;
        private bool discoveryBusy;
        private bool settingDiagnosticText;
        private string preferredModelId;
        private DiagnosticDataEnvelope activeDiagnosticData;
        private BridgeHealthResult lastBridgeHealth;

        public MainForm()
        {
            string applicationDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string profilePath = Path.Combine(
                applicationDirectory,
                "config",
                "ms43-profile.offline.json");
            offlineProfile = Ms43OfflineProfileRepository.Load(profilePath);
            OfflineExecutionPolicy.EnsureLocked(offlineProfile);
            settingsStore = new SafeSettingsStore(
                Path.Combine(applicationDirectory, "copilot-settings.json"));
            string bridgePath = Path.GetFullPath(
                Path.Combine(applicationDirectory, "..", "bridge", "InpaAi.Bridge.exe"));
            bridgeClient = new BridgeHealthClient(bridgePath);

            InitializeForm();
            InitializeLayout();
            PopulateStaticChoices();
            ApplySettings(settingsStore.Load());
            WireEvents();
        }

        private void InitializeForm()
        {
            Text = "INPA AI Copilot - Phase 2C Discovery";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(940, 680);
            Size = new Size(1180, 790);
            BackColor = backgroundColor;
            Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            AutoScaleMode = AutoScaleMode.Dpi;
        }

        private void InitializeLayout()
        {
            TableLayoutPanel root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                BackColor = backgroundColor,
                ColumnCount = 1,
                RowCount = 4,
                Padding = new Padding(14)
            };
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 174));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
            Controls.Add(root);

            root.Controls.Add(BuildHeader(), 0, 0);
            root.Controls.Add(BuildProviderPanel(), 0, 1);
            root.Controls.Add(BuildWorkspace(), 0, 2);
            root.Controls.Add(BuildStatusBar(), 0, 3);
        }

        private Control BuildHeader()
        {
            TableLayoutPanel header = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                BackColor = backgroundColor,
                Margin = new Padding(0, 0, 0, 8)
            };
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            Label title = new Label
            {
                AutoSize = true,
                Text = "INPA AI Copilot",
                Font = new Font("Segoe UI Semibold", 18F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 42, 52),
                Anchor = AnchorStyles.Left
            };
            header.Controls.Add(title, 0, 0);

            ms43ProfileStatusLabel.AutoSize = true;
            ms43ProfileStatusLabel.Text =
                "MS43-Profil: OFFLINE / nicht laufzeitverifiziert";
            ms43ProfileStatusLabel.ForeColor = warningColor;
            ms43ProfileStatusLabel.Font =
                new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
            ms43ProfileStatusLabel.Anchor = AnchorStyles.Right;
            ms43ProfileStatusLabel.Margin = new Padding(8, 0, 10, 0);
            header.Controls.Add(ms43ProfileStatusLabel, 1, 0);

            bridgeStatusLabel.AutoSize = true;
            bridgeStatusLabel.Text = "Bridge: wird geprueft";
            bridgeStatusLabel.ForeColor = warningColor;
            bridgeStatusLabel.Anchor = AnchorStyles.Right;
            bridgeStatusLabel.Margin = new Padding(8, 0, 10, 0);
            header.Controls.Add(bridgeStatusLabel, 2, 0);

            ConfigureCommandButton(bridgeButton, "Bridge pruefen", false);
            bridgeButton.AutoSize = true;
            bridgeButton.Anchor = AnchorStyles.Right;
            header.Controls.Add(bridgeButton, 3, 0);
            return header;
        }

        private Control BuildProviderPanel()
        {
            GroupBox group = new GroupBox
            {
                Text = "Provider",
                Dock = DockStyle.Fill,
                BackColor = panelColor,
                Padding = new Padding(12),
                Margin = new Padding(0, 0, 0, 10)
            };

            TableLayoutPanel table = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                RowCount = 3
            };
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 152));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 132));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            group.Controls.Add(table);

            table.Controls.Add(CreateFieldLabel("Provider"), 0, 0);
            ConfigureDropDown(providerCombo);
            providerCombo.Dock = DockStyle.Fill;
            table.Controls.Add(providerCombo, 1, 0);

            table.Controls.Add(CreateFieldLabel("Verbindung"), 2, 0);
            locationLabel.AutoSize = false;
            locationLabel.Dock = DockStyle.Fill;
            locationLabel.TextAlign = ContentAlignment.MiddleLeft;
            locationLabel.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            table.Controls.Add(locationLabel, 3, 0);

            table.Controls.Add(CreateFieldLabel("Serveradresse"), 0, 1);
            addressText.Dock = DockStyle.Fill;
            addressText.Margin = new Padding(3, 8, 8, 5);
            table.Controls.Add(addressText, 1, 1);
            table.SetColumnSpan(addressText, 3);

            ConfigureCommandButton(connectionButton, "Verbindung testen", false);
            connectionButton.Dock = DockStyle.Fill;
            table.Controls.Add(connectionButton, 0, 2);

            ConfigureCommandButton(modelsButton, "Modelle aktualisieren", false);
            modelsButton.Dock = DockStyle.Fill;
            table.Controls.Add(modelsButton, 1, 2);

            TableLayoutPanel modelPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                Margin = new Padding(8, 0, 0, 0)
            };
            modelPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 68));
            modelPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            modelPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
            modelPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 94));
            Label modelLabel = CreateFieldLabel("Modell");
            modelLabel.TextAlign = ContentAlignment.MiddleLeft;
            modelPanel.Controls.Add(modelLabel, 0, 0);
            ConfigureDropDown(modelCombo);
            modelCombo.Dock = DockStyle.Fill;
            modelPanel.Controls.Add(modelCombo, 1, 0);
            Label timeoutLabel = CreateFieldLabel("Timeout");
            timeoutLabel.TextAlign = ContentAlignment.MiddleRight;
            modelPanel.Controls.Add(timeoutLabel, 2, 0);
            ConfigureDropDown(timeoutCombo);
            timeoutCombo.Dock = DockStyle.Fill;
            modelPanel.Controls.Add(timeoutCombo, 3, 0);
            table.Controls.Add(modelPanel, 2, 2);
            table.SetColumnSpan(modelPanel, 2);

            return group;
        }

        private Control BuildWorkspace()
        {
            SplitContainer split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
                SplitterDistance = 480,
                SplitterWidth = 8,
                BackColor = backgroundColor,
                Margin = new Padding(0)
            };
            bool adjustingSplitter = false;
            split.SizeChanged += delegate
            {
                if (adjustingSplitter || split.ClientSize.Width < 800)
                {
                    return;
                }

                int desired = (int)(split.ClientSize.Width * 0.44);
                if (Math.Abs(split.SplitterDistance - desired) > 2)
                {
                    adjustingSplitter = true;
                    split.SplitterDistance = desired;
                    adjustingSplitter = false;
                }
            };
            split.Panel1.Padding = new Padding(0, 0, 5, 0);
            split.Panel2.Padding = new Padding(5, 0, 0, 0);
            split.Panel1.Controls.Add(BuildInputPanel());
            split.Panel2.Controls.Add(BuildOutputPanel());
            return split;
        }

        private Control BuildInputPanel()
        {
            GroupBox group = new GroupBox
            {
                Text = "Testanfrage",
                Dock = DockStyle.Fill,
                BackColor = panelColor,
                Padding = new Padding(12)
            };
            TableLayoutPanel table = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 4
            };
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            table.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
            table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            group.Controls.Add(table);

            ConfigureDropDown(syntheticCombo);
            syntheticCombo.Dock = DockStyle.Fill;
            table.Controls.Add(syntheticCombo, 0, 0);

            ConfigureCommandButton(loadSyntheticButton, "Testfall laden", false);
            loadSyntheticButton.AutoSize = true;
            loadSyntheticButton.Dock = DockStyle.Fill;
            table.Controls.Add(loadSyntheticButton, 1, 0);

            TableLayoutPanel importPanel = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 2,
                Margin = new Padding(0)
            };
            importPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
            importPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));
            importPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
            importPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));

            ConfigureCommandButton(
                importDiagnosticButton,
                "Diagnose-JSON importieren",
                false);
            importDiagnosticButton.AutoSize = false;
            importDiagnosticButton.Dock = DockStyle.Fill;
            importPanel.Controls.Add(importDiagnosticButton, 0, 0);

            ConfigureCommandButton(
                liveAccessButton,
                "Fahrzeugtest noch nicht freigegeben",
                false);
            liveAccessButton.AutoSize = false;
            liveAccessButton.Dock = DockStyle.Fill;
            liveAccessButton.Enabled = false;
            liveAccessButton.Cursor = Cursors.Default;
            importPanel.Controls.Add(liveAccessButton, 1, 0);

            dataModeLabel.AutoSize = false;
            dataModeLabel.Dock = DockStyle.Fill;
            dataModeLabel.TextAlign = ContentAlignment.MiddleLeft;
            dataModeLabel.Text = "Datenmodus: SYNTHETIC / nicht geladen";
            dataModeLabel.ForeColor = warningColor;
            dataModeLabel.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold);
            dataModeLabel.Margin = new Padding(4, 0, 4, 0);
            importPanel.Controls.Add(dataModeLabel, 0, 1);
            importPanel.SetColumnSpan(dataModeLabel, 2);

            table.Controls.Add(importPanel, 0, 1);
            table.SetColumnSpan(importPanel, 2);

            promptText.Multiline = true;
            promptText.ScrollBars = ScrollBars.Vertical;
            promptText.AcceptsReturn = true;
            promptText.Dock = DockStyle.Fill;
            promptText.MaxLength = DiagnosticDataContract.MaximumImportBytes;
            promptText.Text = "Bitte analysiere die folgenden ausschliesslich synthetischen Testdaten.";
            table.Controls.Add(promptText, 0, 2);
            table.SetColumnSpan(promptText, 2);

            FlowLayoutPanel commands = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                Padding = new Padding(0, 7, 0, 0)
            };
            ConfigureCommandButton(analyzeButton, "Analysieren", true);
            ConfigureCommandButton(cancelButton, "Abbrechen", false);
            cancelButton.Enabled = false;
            commands.Controls.Add(analyzeButton);
            commands.Controls.Add(cancelButton);
            table.Controls.Add(commands, 0, 3);
            table.SetColumnSpan(commands, 2);
            return group;
        }

        private Control BuildOutputPanel()
        {
            GroupBox group = new GroupBox
            {
                Text = "Ergebnis",
                Dock = DockStyle.Fill,
                BackColor = panelColor,
                Padding = new Padding(12)
            };
            TabControl tabs = new TabControl
            {
                Dock = DockStyle.Fill
            };
            TabPage diagnosisPage = new TabPage("Diagnose");
            TabPage rawPage = new TabPage("Rohantwort");
            TabPage catalogPage = new TabPage("MS43-Offlinekatalog");
            TabPage discoveryPage = new TabPage("Fahrzeugerkennung");
            ConfigureOutputText(diagnosisText);
            ConfigureOutputText(rawResponseText);
            ConfigureCatalogGrid();
            diagnosisPage.Controls.Add(diagnosisText);
            rawPage.Controls.Add(rawResponseText);

            TableLayoutPanel catalogLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Margin = new Padding(0)
            };
            catalogLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            catalogLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 74));
            catalogLayout.Controls.Add(catalogGrid, 0, 0);

            catalogSourceText.Dock = DockStyle.Fill;
            catalogSourceText.Multiline = true;
            catalogSourceText.ReadOnly = true;
            catalogSourceText.WordWrap = true;
            catalogSourceText.ScrollBars = ScrollBars.Vertical;
            catalogSourceText.BackColor = Color.White;
            catalogSourceText.Margin = new Padding(0, 5, 0, 0);
            catalogLayout.Controls.Add(catalogSourceText, 0, 1);
            catalogPage.Controls.Add(catalogLayout);
            discoveryPage.Controls.Add(BuildDiscoveryPanel());
            tabs.TabPages.Add(discoveryPage);
            tabs.TabPages.Add(diagnosisPage);
            tabs.TabPages.Add(rawPage);
            tabs.TabPages.Add(catalogPage);
            group.Controls.Add(tabs);
            return group;
        }

        private Control BuildDiscoveryPanel()
        {
            TableLayoutPanel layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Margin = new Padding(0)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));

            TableLayoutPanel header = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 4,
                Margin = new Padding(0)
            };
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            vehicleDiscoveryStatusLabel.AutoSize = true;
            vehicleDiscoveryStatusLabel.Text = "Fahrzeug nicht geprueft";
            vehicleDiscoveryStatusLabel.ForeColor = warningColor;
            vehicleDiscoveryStatusLabel.Font =
                new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
            vehicleDiscoveryStatusLabel.Anchor = AnchorStyles.Left;
            header.Controls.Add(vehicleDiscoveryStatusLabel, 0, 0);

            reachableCountLabel.AutoSize = true;
            reachableCountLabel.Text = "Erreichbare Steuergeraete: 0";
            reachableCountLabel.Anchor = AnchorStyles.Right;
            reachableCountLabel.Margin = new Padding(8, 10, 8, 0);
            header.Controls.Add(reachableCountLabel, 1, 0);

            ConfigureCommandButton(discoveryCancelButton, "Erkennung abbrechen", false);
            discoveryCancelButton.Enabled = false;
            discoveryCancelButton.Anchor = AnchorStyles.Right;
            header.Controls.Add(discoveryCancelButton, 2, 0);

            ConfigureCommandButton(discoveryButton, "Erneut pruefen", false);
            discoveryButton.Enabled = false;
            discoveryButton.Anchor = AnchorStyles.Right;
            header.Controls.Add(discoveryButton, 3, 0);
            layout.Controls.Add(header, 0, 0);

            ConfigureDiscoveryGrid();
            layout.Controls.Add(discoveryGrid, 0, 1);

            diagnosticGroupsLabel.AutoSize = false;
            diagnosticGroupsLabel.Dock = DockStyle.Fill;
            diagnosticGroupsLabel.TextAlign = ContentAlignment.MiddleLeft;
            diagnosticGroupsLabel.Text =
                "Diagnosegruppen: bis zum Abschluss der Erkennung gesperrt";
            diagnosticGroupsLabel.ForeColor = warningColor;
            layout.Controls.Add(diagnosticGroupsLabel, 0, 2);
            return layout;
        }

        private void ConfigureDiscoveryGrid()
        {
            discoveryGrid.Dock = DockStyle.Fill;
            discoveryGrid.ReadOnly = true;
            discoveryGrid.AllowUserToAddRows = false;
            discoveryGrid.AllowUserToDeleteRows = false;
            discoveryGrid.AllowUserToResizeRows = false;
            discoveryGrid.MultiSelect = false;
            discoveryGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            discoveryGrid.RowHeadersVisible = false;
            discoveryGrid.AutoGenerateColumns = false;
            discoveryGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            discoveryGrid.BackgroundColor = Color.White;
            discoveryGrid.BorderStyle = BorderStyle.None;
            discoveryGrid.Columns.Add(CreateCatalogColumn("Steuergeraet", "Module", 130));
            discoveryGrid.Columns.Add(CreateCatalogColumn("SGBD", "Sgbd", 75));
            discoveryGrid.Columns.Add(CreateCatalogColumn("Status", "Status", 75));
            discoveryGrid.Columns.Add(CreateCatalogColumn("Identifikation", "Identification", 150));
            discoveryGrid.Columns.Add(CreateCatalogColumn("Antwortzeit", "Duration", 65));
            discoveryGrid.Columns.Add(CreateCatalogColumn("Fehler", "Error", 140));

            foreach (DiscoveryProbeDefinition probe in E46DiscoveryManifest.All)
            {
                int index = discoveryGrid.Rows.Add(
                    probe.DisplayName,
                    probe.Sgbd,
                    DiscoveryProbeStatus.NotChecked.ToString(),
                    String.Empty,
                    String.Empty,
                    String.Empty);
                discoveryGrid.Rows[index].Tag = probe.ModuleKey;
            }
        }

        private Control BuildStatusBar()
        {
            Panel panel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = backgroundColor,
                Padding = new Padding(4, 7, 0, 0)
            };
            statusLabel.AutoSize = true;
            statusLabel.Text = "Bereit";
            statusLabel.ForeColor = Color.FromArgb(70, 78, 84);
            panel.Controls.Add(statusLabel);
            return panel;
        }

        private static Label CreateFieldLabel(string text)
        {
            return new Label
            {
                Text = text,
                AutoSize = false,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Margin = new Padding(3, 0, 8, 0)
            };
        }

        private static void ConfigureDropDown(ComboBox combo)
        {
            combo.DropDownStyle = ComboBoxStyle.DropDownList;
            combo.IntegralHeight = false;
            combo.MaxDropDownItems = 12;
            combo.Margin = new Padding(3, 7, 8, 5);
        }

        private void ConfigureCommandButton(Button button, string text, bool primary)
        {
            button.Text = text;
            button.AutoSize = true;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = primary ? primaryColor : Color.FromArgb(164, 174, 181);
            button.BackColor = primary ? primaryColor : Color.White;
            button.ForeColor = primary ? Color.White : Color.FromArgb(36, 48, 56);
            button.Padding = new Padding(10, 4, 10, 4);
            button.Margin = new Padding(4);
            button.Cursor = Cursors.Hand;
        }

        private static void ConfigureOutputText(TextBox textBox)
        {
            textBox.Multiline = true;
            textBox.ReadOnly = true;
            textBox.ScrollBars = ScrollBars.Both;
            textBox.WordWrap = true;
            textBox.Dock = DockStyle.Fill;
            textBox.BackColor = Color.White;
            textBox.BorderStyle = BorderStyle.None;
        }

        private void ConfigureCatalogGrid()
        {
            catalogGrid.Dock = DockStyle.Fill;
            catalogGrid.ReadOnly = true;
            catalogGrid.AllowUserToAddRows = false;
            catalogGrid.AllowUserToDeleteRows = false;
            catalogGrid.AllowUserToResizeRows = false;
            catalogGrid.MultiSelect = false;
            catalogGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            catalogGrid.RowHeadersVisible = false;
            catalogGrid.AutoGenerateColumns = false;
            catalogGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            catalogGrid.BackgroundColor = Color.White;
            catalogGrid.BorderStyle = BorderStyle.None;

            catalogGrid.Columns.Add(CreateCatalogColumn("Gruppe", "Group", 90));
            catalogGrid.Columns.Add(CreateCatalogColumn("Job", "Job", 130));
            catalogGrid.Columns.Add(CreateCatalogColumn("Ergebnisfeld", "ResultField", 145));
            catalogGrid.Columns.Add(CreateCatalogColumn("Neutraler Name", "NormalizedName", 125));
            catalogGrid.Columns.Add(CreateCatalogColumn("Einheit", "Unit", 55));
            catalogGrid.Columns.Add(CreateCatalogColumn("Quelle", "Source", 130));
            catalogGrid.Columns.Add(CreateCatalogColumn("Status", "Status", 90));
            catalogGrid.SelectionChanged += delegate { UpdateCatalogSourceDetails(); };
        }

        private static DataGridViewTextBoxColumn CreateCatalogColumn(
            string heading,
            string name,
            float fillWeight)
        {
            return new DataGridViewTextBoxColumn
            {
                HeaderText = heading,
                Name = name,
                FillWeight = fillWeight,
                SortMode = DataGridViewColumnSortMode.Automatic
            };
        }

        private void PopulateStaticChoices()
        {
            providerCombo.Items.Add(new ProviderChoice(ProviderKind.OllamaLocalOrTailscale));
            providerCombo.Items.Add(new ProviderChoice(ProviderKind.OllamaCloud));
            providerCombo.Items.Add(new ProviderChoice(ProviderKind.LmStudioLocalOrTailscale));

            foreach (int seconds in new[] { 5, 15, 30, 60, 120 })
            {
                timeoutCombo.Items.Add(seconds);
            }

            string fixtureDirectory = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "fixtures",
                "synthetic");
            foreach (SyntheticCase synthetic in SyntheticCaseRepository.Load(fixtureDirectory))
            {
                syntheticCombo.Items.Add(synthetic);
            }
            if (syntheticCombo.Items.Count > 0)
            {
                syntheticCombo.SelectedIndex = 0;
            }

            PopulateCatalog();
        }

        private void PopulateCatalog()
        {
            catalogGrid.Rows.Clear();
            foreach (Ms43CatalogEntry entry in offlineProfile.Catalog)
            {
                string unit = entry.Unit ?? "nicht statisch belegt";
                string source =
                    "MS430.IPO " +
                    String.Join("/", entry.Source.IpoOffsets.ToArray()) +
                    "; PRG: bestinfo";
                catalogGrid.Rows.Add(
                    entry.Group,
                    entry.Job,
                    entry.ResultField,
                    entry.NormalizedName,
                    unit,
                    source,
                    "static-confirmed / runtime-unverified");
            }
            if (catalogGrid.Rows.Count > 0)
            {
                catalogGrid.Rows[0].Selected = true;
                UpdateCatalogSourceDetails();
            }
        }

        private void UpdateCatalogSourceDetails()
        {
            if (catalogGrid.SelectedRows.Count == 0)
            {
                catalogSourceText.Text = String.Empty;
                return;
            }

            int index = catalogGrid.SelectedRows[0].Index;
            if (index < 0 || index >= offlineProfile.Catalog.Count)
            {
                catalogSourceText.Text = String.Empty;
                return;
            }

            Ms43CatalogEntry entry = offlineProfile.Catalog[index];
            Ms43StaticSource ipo = FindStaticSource("ipo");
            Ms43StaticSource prg = FindStaticSource("prg");
            catalogSourceText.Text =
                "IPO: " + (ipo == null ? "<nicht vorhanden>" : ipo.Path) +
                " @ " + String.Join(", ", entry.Source.IpoOffsets.ToArray()) +
                Environment.NewLine +
                "IPO SHA-256: " + (ipo == null ? "<nicht vorhanden>" : ipo.Sha256) +
                Environment.NewLine +
                "PRG: " + (prg == null ? "<nicht vorhanden>" : prg.Path) +
                " | " + entry.Source.PrgJobInventory +
                " | static-confirmed / runtime-unverified";
        }

        private Ms43StaticSource FindStaticSource(string id)
        {
            foreach (Ms43StaticSource source in offlineProfile.Sources)
            {
                if (String.Equals(source.Id, id, StringComparison.Ordinal))
                {
                    return source;
                }
            }
            return null;
        }

        private void ApplySettings(CopilotSettings settings)
        {
            ProviderKind kind;
            if (!Enum.TryParse(settings.Provider, false, out kind))
            {
                kind = ProviderKind.OllamaLocalOrTailscale;
            }

            for (int index = 0; index < providerCombo.Items.Count; index++)
            {
                ProviderChoice choice = (ProviderChoice)providerCombo.Items[index];
                if (choice.Kind == kind)
                {
                    providerCombo.SelectedIndex = index;
                    break;
                }
            }

            addressText.Text = settings.BaseUrl;
            SelectTimeout(settings.TimeoutSeconds);
            preferredModelId = settings.ModelId;
            UpdateProviderPresentation(false);
        }

        private void SelectTimeout(int seconds)
        {
            for (int index = 0; index < timeoutCombo.Items.Count; index++)
            {
                if ((int)timeoutCombo.Items[index] == seconds)
                {
                    timeoutCombo.SelectedIndex = index;
                    return;
                }
            }
            timeoutCombo.SelectedItem = 30;
        }

        private void WireEvents()
        {
            providerCombo.SelectedIndexChanged += delegate
            {
                UpdateProviderPresentation(true);
            };
            addressText.TextChanged += delegate { UpdateLocationLabel(); };
            connectionButton.Click += async delegate { await TestConnectionAsync(); };
            modelsButton.Click += async delegate { await RefreshModelsAsync(); };
            analyzeButton.Click += async delegate { await AnalyzeAsync(); };
            cancelButton.Click += delegate
            {
                if (providerCancellation != null)
                {
                    providerCancellation.Cancel();
                }
            };
            loadSyntheticButton.Click += delegate { LoadSelectedSyntheticCase(); };
            importDiagnosticButton.Click += delegate { ImportDiagnosticJson(); };
            promptText.TextChanged += delegate
            {
                if (!settingDiagnosticText && activeDiagnosticData != null)
                {
                    activeDiagnosticData = null;
                    dataModeLabel.Text = "Datenmodus: FREITEXT / kein Datenvertrag";
                    dataModeLabel.ForeColor = warningColor;
                }
            };
            bridgeButton.Click += async delegate { await CheckBridgeAsync(); };
            discoveryButton.Click += async delegate { await RunVehicleDiscoveryAsync(); };
            discoveryCancelButton.Click += delegate
            {
                if (discoveryCancellation != null)
                {
                    discoveryCancellation.Cancel();
                }
            };
            Shown += async delegate { await CheckBridgeAsync(); };
            FormClosing += OnFormClosing;
        }

        private void UpdateProviderPresentation(bool resetAddress)
        {
            if (providerCombo.SelectedItem == null)
            {
                return;
            }

            ProviderKind kind = ((ProviderChoice)providerCombo.SelectedItem).Kind;
            if (kind == ProviderKind.OllamaCloud)
            {
                addressText.Text = "https://ollama.com";
                addressText.Enabled = false;
            }
            else
            {
                addressText.Enabled = !providerBusy;
                if (resetAddress ||
                    String.IsNullOrWhiteSpace(addressText.Text) ||
                    String.Equals(addressText.Text, "https://ollama.com", StringComparison.OrdinalIgnoreCase))
                {
                    addressText.Text = kind == ProviderKind.LmStudioLocalOrTailscale
                        ? "http://127.0.0.1:1234"
                        : "http://127.0.0.1:11434";
                }
            }

            if (resetAddress)
            {
                modelCombo.Items.Clear();
                preferredModelId = null;
            }
            UpdateLocationLabel();
        }

        private void UpdateLocationLabel()
        {
            try
            {
                ProviderKind kind = SelectedProviderKind();
                Uri uri = BaseUrlNormalizer.Normalize(addressText.Text, kind);
                locationLabel.Text = BaseUrlNormalizer.Classify(uri, kind);
                locationLabel.ForeColor = kind == ProviderKind.OllamaCloud
                    ? warningColor
                    : successColor;
            }
            catch
            {
                locationLabel.Text = "UNGUELTIG";
                locationLabel.ForeColor = errorColor;
            }
        }

        private async Task TestConnectionAsync()
        {
            await RunProviderOperationAsync(
                "Verbindung wird getestet...",
                async delegate(IAiProvider provider, CancellationToken token)
                {
                    ProviderConnectionResult result =
                        await provider.TestConnectionAsync(token);
                    SetStatus(
                        "Verbunden: " + BaseUrlNormalizer.Classify(result.BaseUri, provider.Kind) +
                        ", Modelle: " + result.ModelCount,
                        successColor);
                });
        }

        private async Task RefreshModelsAsync()
        {
            await RunProviderOperationAsync(
                "Modelle werden geladen...",
                async delegate(IAiProvider provider, CancellationToken token)
                {
                    IList<string> models = await provider.GetModelsAsync(token);
                    string previous = modelCombo.SelectedItem as string ?? preferredModelId;
                    modelCombo.BeginUpdate();
                    modelCombo.Items.Clear();
                    foreach (string model in models)
                    {
                        modelCombo.Items.Add(model);
                    }
                    modelCombo.EndUpdate();

                    int previousIndex = previous == null ? -1 : modelCombo.Items.IndexOf(previous);
                    modelCombo.SelectedIndex = previousIndex >= 0 ? previousIndex : 0;
                    preferredModelId = null;
                    SetStatus("Verbunden: " + models.Count + " Modell(e) geladen.", successColor);
                });
        }

        private async Task AnalyzeAsync()
        {
            string model = modelCombo.SelectedItem as string;
            string userInput = promptText.Text;
            if (String.IsNullOrWhiteSpace(model))
            {
                SetStatus("Fehler: Bitte zuerst ein tatsaechlich gemeldetes Modell auswaehlen.", errorColor);
                return;
            }
            if (String.IsNullOrWhiteSpace(userInput))
            {
                SetStatus("Fehler: Die Testanfrage ist leer.", errorColor);
                return;
            }
            if (!ValidateDiagnosticPayloadForAnalysis(userInput))
            {
                return;
            }

            await RunProviderOperationAsync(
                "Analyse laeuft...",
                async delegate(IAiProvider provider, CancellationToken token)
                {
                    string systemPrompt = DiagnosisContract.SystemPrompt;
                    if (activeDiagnosticData != null &&
                        String.Equals(
                            activeDiagnosticData.DataMode,
                            "LIVE",
                            StringComparison.Ordinal))
                    {
                        systemPrompt += Environment.NewLine + Environment.NewLine +
                            VehicleCapabilityContext.BuildAiContext(vehicleProfileStore.Current);
                    }

                    IList<ChatMessage> messages = new List<ChatMessage>
                    {
                        new ChatMessage("system", systemPrompt),
                        new ChatMessage("user", userInput)
                    };
                    string raw = await provider.ChatAsync(model, messages, token);
                    rawResponseText.Text = raw;

                    DiagnosisParseResult parsed = DiagnosisContract.Parse(raw);
                    if (!parsed.Success)
                    {
                        diagnosisText.Text =
                            "Parserfehler: " + parsed.Error +
                            Environment.NewLine +
                            "Die unbearbeitete Modellantwort steht separat im Tab 'Rohantwort'.";
                        SetStatus("Fehler: Modellantwort verletzt den Diagnosevertrag.", errorColor);
                        return;
                    }

                    diagnosisText.Text = DiagnosisContract.Format(parsed.Diagnosis);
                    SetStatus("Analyse abgeschlossen und Diagnose-JSON validiert.", successColor);
                });
        }

        private async Task RunProviderOperationAsync(
            string busyText,
            Func<IAiProvider, CancellationToken, Task> operation)
        {
            if (providerBusy)
            {
                return;
            }

            providerCancellation = new CancellationTokenSource();
            SetProviderBusy(true);
            SetStatus(busyText, primaryColor);

            try
            {
                using (IAiProvider provider = ProviderFactory.Create(BuildProviderOptions()))
                {
                    await operation(provider, providerCancellation.Token);
                }
            }
            catch (ProviderException exception)
            {
                string message = SecretRedactor.Redact(
                    exception.Message,
                    SecretRedactor.CurrentRuntimeSecrets());
                SetStatus("Fehler [" + exception.Code + "]: " + message, errorColor);
            }
            catch (Exception exception)
            {
                string message = SecretRedactor.Redact(
                    exception.Message,
                    SecretRedactor.CurrentRuntimeSecrets());
                SetStatus("Fehler: " + message, errorColor);
            }
            finally
            {
                providerCancellation.Dispose();
                providerCancellation = null;
                SetProviderBusy(false);
            }
        }

        private ProviderOptions BuildProviderOptions()
        {
            int timeoutSeconds = timeoutCombo.SelectedItem == null
                ? 30
                : (int)timeoutCombo.SelectedItem;
            return new ProviderOptions
            {
                Kind = SelectedProviderKind(),
                BaseUrl = addressText.Text,
                Timeout = TimeSpan.FromSeconds(timeoutSeconds),
                MaximumResponseBytes = ProviderOptions.DefaultMaximumResponseBytes
            };
        }

        private ProviderKind SelectedProviderKind()
        {
            ProviderChoice choice = providerCombo.SelectedItem as ProviderChoice;
            return choice == null ? ProviderKind.OllamaLocalOrTailscale : choice.Kind;
        }

        private void SetProviderBusy(bool busy)
        {
            providerBusy = busy;
            providerCombo.Enabled = !busy;
            addressText.Enabled = !busy && SelectedProviderKind() != ProviderKind.OllamaCloud;
            connectionButton.Enabled = !busy;
            modelsButton.Enabled = !busy;
            modelCombo.Enabled = !busy;
            timeoutCombo.Enabled = !busy;
            analyzeButton.Enabled = !busy;
            loadSyntheticButton.Enabled = !busy;
            importDiagnosticButton.Enabled = !busy;
            cancelButton.Enabled = busy;
            discoveryButton.Enabled = !busy && !discoveryBusy && lastBridgeHealth != null;
        }

        private void LoadSelectedSyntheticCase()
        {
            SyntheticCase synthetic = syntheticCombo.SelectedItem as SyntheticCase;
            if (synthetic == null)
            {
                SetStatus("Fehler: Kein synthetischer Testfall verfuegbar.", errorColor);
                return;
            }

            try
            {
                ApplyDiagnosticJson(synthetic.Json);
                SetStatus(
                    "SYNTHETIC-Testfall geladen und Datenvertrag validiert. " +
                    "Keine echten Fahrzeugdaten.",
                    warningColor);
            }
            catch (DiagnosticDataException exception)
            {
                SetStatus(
                    "Fehler [" + exception.Code + "]: " + exception.Message,
                    errorColor);
            }
        }

        private void ImportDiagnosticJson()
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "Lokales Diagnose-JSON importieren";
                dialog.Filter = "JSON-Dateien (*.json)|*.json|Alle Dateien (*.*)|*.*";
                dialog.CheckFileExists = true;
                dialog.Multiselect = false;
                dialog.RestoreDirectory = true;
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                try
                {
                    FileInfo file = new FileInfo(dialog.FileName);
                    if (file.Length > DiagnosticDataContract.MaximumImportBytes)
                    {
                        throw new DiagnosticDataException(
                            "DATA_IMPORT_TOO_LARGE",
                            "Das Diagnose-JSON ist groesser als 1 MiB.");
                    }

                    string json = File.ReadAllText(dialog.FileName);
                    ApplyDiagnosticJson(json);
                    SetStatus(
                        "Lokales Diagnose-JSON validiert. Es wurde keine Bridge-Anfrage erzeugt.",
                        activeDiagnosticData.DataMode == "LIVE"
                            ? successColor
                            : warningColor);
                }
                catch (DiagnosticDataException exception)
                {
                    SetStatus(
                        "Fehler [" + exception.Code + "]: " + exception.Message,
                        errorColor);
                }
                catch (Exception exception)
                {
                    SetStatus(
                        "Fehler beim lokalen JSON-Import: " + exception.Message,
                        errorColor);
                }
            }
        }

        private void ApplyDiagnosticJson(string json)
        {
            DiagnosticDataEnvelope envelope =
                DiagnosticDataContract.ParseAndNormalize(json, offlineProfile);
            if (String.Equals(envelope.DataMode, "LIVE", StringComparison.Ordinal) &&
                !VehicleCapabilityContext.CanUseEcu(
                    vehicleProfileStore.Current,
                    envelope.Ecu))
            {
                throw new DiagnosticDataException(
                    "ECU_NOT_DISCOVERED",
                    "LIVE-Daten werden nur fuer ein zuvor bestaetigtes Steuergeraet akzeptiert.");
            }
            activeDiagnosticData = envelope;
            settingDiagnosticText = true;
            try
            {
                promptText.Text = json;
            }
            finally
            {
                settingDiagnosticText = false;
            }

            if (envelope.DataMode == "SYNTHETIC")
            {
                dataModeLabel.Text = "Datenmodus: SYNTHETIC / keine Fahrzeugdaten";
                dataModeLabel.ForeColor = warningColor;
            }
            else
            {
                dataModeLabel.Text = "Datenmodus: LIVE / laufzeitverifiziert";
                dataModeLabel.ForeColor = successColor;
            }
        }

        private bool ValidateDiagnosticPayloadForAnalysis(string text)
        {
            if (activeDiagnosticData != null)
            {
                return true;
            }

            string trimmed = text.TrimStart();
            if (!trimmed.StartsWith("{", StringComparison.Ordinal) ||
                (trimmed.IndexOf("\"schemaVersion\"", StringComparison.Ordinal) < 0 &&
                 trimmed.IndexOf("\"dataMode\"", StringComparison.Ordinal) < 0))
            {
                return true;
            }

            try
            {
                ApplyDiagnosticJson(text);
                return true;
            }
            catch (DiagnosticDataException exception)
            {
                SetStatus(
                    "Fehler [" + exception.Code + "]: " + exception.Message,
                    errorColor);
                return false;
            }
        }

        private async Task CheckBridgeAsync()
        {
            if (discoveryBusy)
            {
                return;
            }

            bridgeButton.Enabled = false;
            discoveryButton.Enabled = false;
            bridgeStatusLabel.Text = "Bridge: wird geprueft";
            bridgeStatusLabel.ForeColor = warningColor;
            bridgeCancellation = new CancellationTokenSource();
            try
            {
                BridgeHealthResult result = await bridgeClient.CheckAsync(
                    TimeSpan.FromSeconds(10),
                    bridgeCancellation.Token);
                if (!String.Equals(
                    result.DiscoveryManifestVersion,
                    E46DiscoveryManifest.ManifestVersion,
                    StringComparison.Ordinal) ||
                    result.DiscoveryProbeCount != E46DiscoveryManifest.All.Count)
                {
                    throw new BridgeHealthException(
                        "DISCOVERY_MANIFEST_MISMATCH",
                        "Bridge und Copilot verwenden nicht dasselbe feste Discovery-Manifest.",
                        "bridge-health");
                }

                lastBridgeHealth = result;
                bridgeStatusLabel.Text =
                    "Bridge: verbunden, " + result.ProcessBitness + " Bit, " + result.Mode;
                bridgeStatusLabel.ForeColor = successColor;
            }
            catch (BridgeHealthException exception)
            {
                lastBridgeHealth = null;
                bridgeStatusLabel.Text = "Bridge: Fehler [" + exception.Code + "]";
                bridgeStatusLabel.ForeColor = errorColor;
                SetStatus(exception.Message, errorColor);
            }
            finally
            {
                bridgeCancellation.Dispose();
                bridgeCancellation = null;
                bridgeButton.Enabled = true;
                discoveryButton.Enabled = lastBridgeHealth != null;
            }
        }

        private async Task RunVehicleDiscoveryAsync()
        {
            if (discoveryBusy)
            {
                return;
            }
            if (lastBridgeHealth == null)
            {
                await CheckBridgeAsync();
                if (lastBridgeHealth == null)
                {
                    return;
                }
            }

            discoveryBusy = true;
            discoveryCancellation = new CancellationTokenSource();
            string previousVin = vehicleProfileStore.Current == null
                ? null
                : vehicleProfileStore.Current.Vin;
            vehicleProfileStore.Clear();
            activeDiagnosticData = activeDiagnosticData != null &&
                activeDiagnosticData.DataMode == "SYNTHETIC"
                ? activeDiagnosticData
                : null;
            ResetDiscoveryGrid();
            vehicleDiscoveryStatusLabel.Text = "Erkennung laeuft";
            vehicleDiscoveryStatusLabel.ForeColor = primaryColor;
            reachableCountLabel.Text = "Erreichbare Steuergeraete: 0";
            diagnosticGroupsLabel.Text =
                "Diagnosegruppen: bis zum Abschluss der Erkennung gesperrt";
            diagnosticGroupsLabel.ForeColor = warningColor;
            discoveryButton.Enabled = false;
            discoveryCancelButton.Enabled = true;
            bridgeButton.Enabled = false;
            liveAccessButton.Enabled = false;

            try
            {
                VehicleDiscoveryScanner scanner = new VehicleDiscoveryScanner(
                    E46DiscoveryManifest.All,
                    bridgeClient,
                    new InstalledPrgVerifier(lastBridgeHealth.EcuPath));
                Progress<DiscoveryProbeResult> progress =
                    new Progress<DiscoveryProbeResult>(UpdateDiscoveryRow);
                VehicleDiscoveryProfile profile = await scanner.ScanAsync(
                    progress,
                    discoveryCancellation.Token);
                bool vinChanged = vehicleProfileStore.Store(profile, previousVin);
                PopulateDiscoveryResults(profile);
                ApplyVehicleProfilePresentation(profile, vinChanged);
            }
            catch (Exception exception)
            {
                vehicleDiscoveryStatusLabel.Text =
                    "Fahrzeugverbindung konnte nicht bestaetigt werden";
                vehicleDiscoveryStatusLabel.ForeColor = errorColor;
                diagnosticGroupsLabel.Text = "Diagnosegruppen: gesperrt";
                diagnosticGroupsLabel.ForeColor = errorColor;
                SetStatus(
                    "Discovery-Fehler: " + SecretRedactor.Redact(
                        exception.Message,
                        SecretRedactor.CurrentRuntimeSecrets()),
                    errorColor);
            }
            finally
            {
                discoveryCancellation.Dispose();
                discoveryCancellation = null;
                discoveryBusy = false;
                discoveryCancelButton.Enabled = false;
                discoveryButton.Enabled = lastBridgeHealth != null && !providerBusy;
                bridgeButton.Enabled = true;
            }
        }

        private void ResetDiscoveryGrid()
        {
            foreach (DataGridViewRow row in discoveryGrid.Rows)
            {
                row.Cells["Status"].Value = DiscoveryProbeStatus.NotChecked.ToString();
                row.Cells["Identification"].Value = String.Empty;
                row.Cells["Duration"].Value = String.Empty;
                row.Cells["Error"].Value = String.Empty;
            }
        }

        private void PopulateDiscoveryResults(VehicleDiscoveryProfile profile)
        {
            foreach (DiscoveryProbeResult result in profile.Results)
            {
                UpdateDiscoveryRow(result);
            }
        }

        private void UpdateDiscoveryRow(DiscoveryProbeResult result)
        {
            if (result == null)
            {
                return;
            }

            foreach (DataGridViewRow row in discoveryGrid.Rows)
            {
                if (!String.Equals(
                    row.Tag as string,
                    result.Definition.ModuleKey,
                    StringComparison.Ordinal))
                {
                    continue;
                }

                row.Cells["Status"].Value = result.Status.ToString();
                row.Cells["Identification"].Value = result.Identification ?? String.Empty;
                row.Cells["Duration"].Value = result.Attempts == 0
                    ? String.Empty
                    : result.DurationMilliseconds + " ms";
                string error = result.ErrorCode;
                if (!String.IsNullOrEmpty(result.ErrorMessage))
                {
                    error = String.IsNullOrEmpty(error)
                        ? result.ErrorMessage
                        : error + ": " + result.ErrorMessage;
                }
                row.Cells["Error"].Value = error ?? String.Empty;
                break;
            }
        }

        private void ApplyVehicleProfilePresentation(
            VehicleDiscoveryProfile profile,
            bool vinChanged)
        {
            reachableCountLabel.Text =
                "Erreichbare Steuergeraete: " + profile.ReachableCount;
            if (profile.State == VehicleDiscoveryState.Cancelled)
            {
                vehicleDiscoveryStatusLabel.Text = "Fahrzeugerkennung abgebrochen";
                vehicleDiscoveryStatusLabel.ForeColor = warningColor;
                diagnosticGroupsLabel.Text = "Diagnosegruppen: gesperrt";
                diagnosticGroupsLabel.ForeColor = warningColor;
                SetStatus("Fahrzeugerkennung wurde abgebrochen.", warningColor);
                return;
            }
            if (!profile.ConnectionConfirmed)
            {
                vehicleDiscoveryStatusLabel.Text =
                    "Fahrzeugverbindung konnte nicht bestaetigt werden";
                vehicleDiscoveryStatusLabel.ForeColor = errorColor;
                diagnosticGroupsLabel.Text = "Diagnosegruppen: gesperrt";
                diagnosticGroupsLabel.ForeColor = errorColor;
                SetStatus(
                    "Fahrzeugverbindung konnte nicht bestaetigt werden.",
                    errorColor);
                return;
            }

            vehicleDiscoveryStatusLabel.Text = "Fahrzeug erkannt";
            vehicleDiscoveryStatusLabel.ForeColor = successColor;
            IList<string> groups = VehicleCapabilityContext.DiagnosticGroups(profile);
            diagnosticGroupsLabel.Text = groups.Count == 0
                ? "Diagnosegruppen: keine bestaetigten Gruppen"
                : "Diagnosegruppen (nur bestaetigte Steuergeraete): " +
                    String.Join(", ", new List<string>(groups).ToArray());
            diagnosticGroupsLabel.ForeColor = successColor;
            string vinText = String.IsNullOrEmpty(profile.Vin)
                ? "VIN nicht sicher gelesen; Profil gilt nur fuer diese Sitzung."
                : "VIN-gebundenes Sitzungsprofil: " + profile.Vin + ".";
            if (vinChanged)
            {
                vinText += " Vorheriges VIN-Profil wurde verworfen.";
            }
            SetStatus(
                profile.ReachableCount + " Steuergeraet(e) erreichbar. " + vinText,
                successColor);
        }

        private void SetStatus(string text, Color color)
        {
            statusLabel.Text = text;
            statusLabel.ForeColor = color;
        }

        private void OnFormClosing(object sender, FormClosingEventArgs args)
        {
            if (providerCancellation != null)
            {
                providerCancellation.Cancel();
            }
            if (bridgeCancellation != null)
            {
                bridgeCancellation.Cancel();
            }
            if (discoveryCancellation != null)
            {
                discoveryCancellation.Cancel();
            }

            try
            {
                settingsStore.Save(new CopilotSettings
                {
                    Provider = SelectedProviderKind().ToString(),
                    BaseUrl = addressText.Text,
                    ModelId = modelCombo.SelectedItem as string ??
                        preferredModelId ??
                        String.Empty,
                    TimeoutSeconds = timeoutCombo.SelectedItem == null
                        ? 30
                        : (int)timeoutCombo.SelectedItem
                });
            }
            catch
            {
            }

            bridgeClient.Dispose();
        }

        private sealed class ProviderChoice
        {
            public ProviderChoice(ProviderKind kind)
            {
                Kind = kind;
            }

            public ProviderKind Kind { get; private set; }

            public override string ToString()
            {
                return ProviderKindNames.ToDisplayName(Kind);
            }
        }
    }
}
