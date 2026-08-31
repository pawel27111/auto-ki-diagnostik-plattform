using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace InpaAi.Shared
{
    internal sealed class DiscoveryProbeDefinition
    {
        public DiscoveryProbeDefinition(
            string moduleKey,
            string familyKey,
            string displayName,
            string sgbd,
            string prgFile,
            string prgSha256,
            string diagnosticAddress,
            string command,
            string job,
            string[] expectedResultFields,
            string[] vinResultFields,
            int timeoutMilliseconds,
            int maximumRetries,
            string[] diagnosticGroups)
        {
            ModuleKey = moduleKey;
            FamilyKey = familyKey;
            DisplayName = displayName;
            Sgbd = sgbd;
            PrgFile = prgFile;
            PrgSha256 = prgSha256;
            DiagnosticAddress = diagnosticAddress;
            Command = command;
            Job = job;
            ExpectedResultFields = AsReadOnly(expectedResultFields);
            VinResultFields = AsReadOnly(vinResultFields);
            TimeoutMilliseconds = timeoutMilliseconds;
            MaximumRetries = maximumRetries;
            DiagnosticGroups = AsReadOnly(diagnosticGroups);
        }

        public string ModuleKey { get; private set; }
        public string FamilyKey { get; private set; }
        public string DisplayName { get; private set; }
        public string Sgbd { get; private set; }
        public string PrgFile { get; private set; }
        public string PrgSha256 { get; private set; }
        public string DiagnosticAddress { get; private set; }
        public string Command { get; private set; }
        public string Job { get; private set; }
        public IList<string> ExpectedResultFields { get; private set; }
        public IList<string> VinResultFields { get; private set; }
        public int TimeoutMilliseconds { get; private set; }
        public int MaximumRetries { get; private set; }
        public IList<string> DiagnosticGroups { get; private set; }

        private static IList<string> AsReadOnly(string[] values)
        {
            return new ReadOnlyCollection<string>((string[])values.Clone());
        }
    }

    internal static class E46DiscoveryManifest
    {
        public const string ManifestVersion = "2C.2";
        public const string VehicleProfile = "BMW E46 320Ci M54B22";

        private static readonly string[] CommonIdentificationFields =
        {
            "JOB_STATUS",
            "ID_BMW_NR",
            "ID_HW_NR",
            "ID_DIAG_INDEX",
            "ID_SW_NR"
        };

        private static readonly string[] Empty = new string[0];

        private static readonly IList<DiscoveryProbeDefinition> Probes =
            new ReadOnlyCollection<DiscoveryProbeDefinition>(
                new List<DiscoveryProbeDefinition>
                {
                    Probe(
                        "engine.ms43",
                        "engine.dme",
                        "Motorsteuerung Siemens MS43",
                        "MS430DS0",
                        "ms430ds0.prg",
                        "8C4714D638DE8E9D765A86EEC9746495883366D21126A454AB2EF28279E3A523",
                        "discover-engine-ms43",
                        "IDENT_AIF",
                        new[]
                        {
                            "JOB_STATUS", "ID_BMW_NR", "ID_HW_NR", "ID_DIAG_INDEX",
                            "ID_SW_NR", "AIF_FG_NR"
                        },
                        new[] { "AIF_FG_NR" },
                        5000,
                        new[]
                        {
                            "Identifikation", "Motordrehzahl", "Temperaturen",
                            "Bordspannung", "Gemischadaption", "VANOS"
                        }),
                    Probe(
                        "chassis.dsc-mk60",
                        "chassis.dsc",
                        "Dynamische Stabilitaetskontrolle MK60",
                        "DSC_MK60",
                        "dsc_mk60.prg",
                        "31114223634211CC8A241B343916FAE9D235AC6FD42C2F319095ADA411AA97EA",
                        "discover-chassis-dsc-mk60",
                        "IDENT",
                        new[]
                        {
                            "JOB_STATUS", "ID_BMW_NR", "ID_HW_NR", "ID_DIAG_INDEX",
                            "ID_SW_NR_FSV"
                        },
                        Empty,
                        4000,
                        new[] { "Fahrwerk", "DSC" }),
                    Ident(
                        "chassis.dsc-e46",
                        "chassis.dsc",
                        "Dynamische Stabilitaetskontrolle DSC E46",
                        "DSC_E46",
                        "DSC_E46.prg",
                        "DDABF6544ED312DF7175DEC14283B22959B237907BA8F756FFFFE7BBEF3A38D8",
                        "discover-chassis-dsc-e46",
                        new[] { "Fahrwerk", "DSC" }),
                    Ident(
                        "chassis.asc-mk20",
                        "chassis.dsc",
                        "Automatische Stabilitaetskontrolle ASC MK20",
                        "ASCMK20",
                        "ASCMK20.prg",
                        "456ABC1CB1A1726FF584375B70318A9AB5DAE6925CCBA00D85663B35C8C439C7",
                        "discover-chassis-asc-mk20",
                        new[] { "Fahrwerk", "ASC" }),
                    Ident(
                        "chassis.dsc57",
                        "chassis.dsc",
                        "Dynamische Stabilitaetskontrolle DSC 5.7",
                        "DSC57",
                        "DSC57.prg",
                        "B1444C0A6A96AEB1C767751672D5F9FDB0843E044E03060A6610C54767E14825",
                        "discover-chassis-dsc57",
                        new[] { "Fahrwerk", "DSC" }),
                    Ident(
                        "chassis.rdc",
                        "chassis.tire-pressure",
                        "Reifendruckkontrolle RDC",
                        "RDC",
                        "RDC.prg",
                        "61298A8E5C96B92CFA4AB22161366FD52570FA9C3B923C5678E387D4A01C8855",
                        "discover-chassis-rdc",
                        new[] { "Reifendruckkontrolle" }),
                    Ident(
                        "chassis.dws",
                        "chassis.tire-pressure",
                        "Reifendruckwarnsystem DWS",
                        "DWS",
                        "DWS.prg",
                        "78CE384713B4BBD0F1B1F06781C9261B5E751719F6F57F735C89A191D30AA853",
                        "discover-chassis-dws",
                        new[] { "Reifendruckkontrolle" }),
                    Probe(
                        "security.ews3",
                        "security.ews",
                        "Elektronische Wegfahrsperre EWS3",
                        "EWS3",
                        "ews3.prg",
                        "177B880F5967B74AA3393AB83C33B9716EFF096E9D4FD610DAD32D472615AB26",
                        "discover-security-ews3",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Wegfahrsperre" }),
                    Probe(
                        "body.cluster-kombi46r",
                        "body.cluster",
                        "Kombiinstrument E46 Redesign",
                        "KOMBI46R",
                        "KOMBI46R.prg",
                        "29F8C733D1C6955FD1ABA9DA98667853127569AD76827F973F1F78A5060A573F",
                        "discover-body-kombi46r",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Kombiinstrument" }),
                    Probe(
                        "body.cluster-kombi46",
                        "body.cluster",
                        "Kombiinstrument E46",
                        "KOMBI46",
                        "KOMBI46.prg",
                        "72C3E4743CB3B3EDA9AB24D4A9CCA79A4FF175A5B317438E49137EB0B923E5BF",
                        "discover-body-kombi46",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Kombiinstrument" }),
                    Probe(
                        "safety.airbag-mrs4",
                        "safety.airbag",
                        "Airbag MRS4",
                        "MRS4",
                        "mrs4.prg",
                        "BA47B7AD55630F18904D14204D340AAC4EF1F7C0F64C685E716F22A3EBB5880D",
                        "discover-safety-mrs4",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Airbag" }),
                    Probe(
                        "safety.airbag-mrs3",
                        "safety.airbag",
                        "Airbag MRS3",
                        "MRS3",
                        "MRS3.prg",
                        "8F378CAA58A60D17D48A54FE1B6465CD8204029285DD0643EE89E27A9D7AEC43",
                        "discover-safety-mrs3",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Airbag" }),
                    Probe(
                        "safety.airbag-mrs2",
                        "safety.airbag",
                        "Airbag MRS2",
                        "MRS2",
                        "MRS2.prg",
                        "DABB9C7B88B9E4949454995012CF7976AD3EC92C14C740379A22B4D53A91ABC7",
                        "discover-safety-mrs2",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Airbag" }),
                    Probe(
                        "climate.ihka46-2",
                        "climate.ihka",
                        "Klimaautomatik IHKA E46 PU",
                        "IHKA46_2",
                        "ihka46_2.prg",
                        "023760904EE8FCE075E6725FD5A166247990BE03111CEA80BF675653DA9D240E",
                        "discover-climate-ihka46-2",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Klimaautomatik" }),
                    Probe(
                        "climate.ihka46",
                        "climate.ihka",
                        "Klimaautomatik IHKA E46",
                        "IHKA46",
                        "ihka46.prg",
                        "48D9BE03388CB9541AA7C09133D21364A85C78012A624686D913723B31B7271F",
                        "discover-climate-ihka46",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Klimaautomatik" }),
                    Probe(
                        "body.lsz",
                        "body.lsz",
                        "Lichtschaltzentrum LSZ",
                        "LSZ",
                        "LSZ.prg",
                        "19BA5AF03303276BA29D2CCC41B1424875A5821D75C2348AFF03EEA0B2623CE5",
                        "discover-body-lsz",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Beleuchtung" }),
                    Probe(
                        "chassis.lws5",
                        "chassis.lws",
                        "Lenkwinkelsensor LWS5",
                        "LWS5",
                        "lws5.prg",
                        "1EFAA5D2B7A94C504A9CFE22D5F0E552576CF4EDE1B67C4AEBB5AA39ED6EDAAC",
                        "discover-chassis-lws5",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Lenkwinkelsensor" }),
                    Probe(
                        "body.zke5",
                        "body.zke",
                        "Zentrale Karosserie-Elektronik ZKE5",
                        "ZKE5",
                        "zke5.prg",
                        "6572A20805D2DD1C07D8B367FEDFF62109CDFBE438F2C98610CD572701118E94",
                        "discover-body-zke5",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Karosserieelektronik" }),
                    Ident(
                        "body.mfl2",
                        "body.mfl",
                        "Multifunktionslenkrad MFL2",
                        "MFL2",
                        "MFL2.prg",
                        "D232C9947D63A3CB44793D2BE0B156149C925384B4E3442CA1134C1C07E107A9",
                        "discover-body-mfl2",
                        new[] { "Multifunktionslenkrad" }),
                    Ident(
                        "body.mfl",
                        "body.mfl",
                        "Multifunktionslenkrad MFL",
                        "MFL",
                        "MFL.prg",
                        "9EF622F26FFCC2CD9F6CA305400ABB760696CC7B6D14E2D6CD4AC80AFD8C6B3C",
                        "discover-body-mfl",
                        new[] { "Multifunktionslenkrad" }),
                    Ident(
                        "body.rls-ds2",
                        "body.rain-light-sensor",
                        "Regen- und Lichtsensor RLS",
                        "RLS_DS2",
                        "RLS_DS2.prg",
                        "9D4DCDA53D556B54F6E9A1DB91148523CEE42C0682B1315C8D8FF677742851EE",
                        "discover-body-rls-ds2",
                        new[] { "Regen-Licht-Sensor" }),
                    Ident(
                        "body.aic",
                        "body.rain-light-sensor",
                        "Regensensor AIC",
                        "AIC",
                        "AIC.prg",
                        "AF1F328F1B80B23424BFC963637F0BB2468A84A66F708A52C11FE36BE2FE758F",
                        "discover-body-aic",
                        new[] { "Regensensor" }),
                    Ident(
                        "body.szm46",
                        "body.szm",
                        "Schaltzentrum Mittelkonsole E46",
                        "SZM46",
                        "SZM46.prg",
                        "F6ECD46674EA4E8E63B871B5F22B33CA0FB21D4D99857B18C06AF350CE950BC0",
                        "discover-body-szm46",
                        new[] { "Schaltzentrum Mittelkonsole" }),
                    Ident(
                        "body.szm38",
                        "body.szm",
                        "Schaltzentrum Mittelkonsole SZM38",
                        "SZM38",
                        "SZM38.prg",
                        "316A4FBDA5F6EDC3BF9A135024374D1C07155B06E3C76407C49E6AD36F239341",
                        "discover-body-szm38",
                        new[] { "Schaltzentrum Mittelkonsole" }),
                    Ident(
                        "body.shd46-2",
                        "body.sunroof",
                        "Schiebehebedachmodul SHD E46 PU",
                        "SHD46_2",
                        "SHD46_2.prg",
                        "CDC2C084BD99D37328D471345D61F950EA5BCE5CF7B5F4CAE6199F3D957ED2F8",
                        "discover-body-shd46-2",
                        new[] { "Schiebehebedach" }),
                    Ident(
                        "body.shd46",
                        "body.sunroof",
                        "Schiebehebedachmodul SHD E46",
                        "SHD46",
                        "SHD46.prg",
                        "2342FF1475A22E26B687CA7B411AA2B962219BBB23075BDCD17F5A1C785B98E4",
                        "discover-body-shd46",
                        new[] { "Schiebehebedach" }),
                    Ident(
                        "body.xenon-left",
                        "body.xenon-left",
                        "Xenonlicht links",
                        "XENON_L",
                        "XENON_L.prg",
                        "420168F85E47A8B2121D1CF5C50D9E49A3DA7686A9D64CDD6166672F4C6D1B5F",
                        "discover-body-xenon-left",
                        new[] { "Xenonlicht links" }),
                    Ident(
                        "body.xenon-right",
                        "body.xenon-right",
                        "Xenonlicht rechts",
                        "XENON_R",
                        "XENON_R.prg",
                        "1D3BE5028D7CFACF35094842CE767422F98B79DA52238B53FE61FE9F48499AF8",
                        "discover-body-xenon-right",
                        new[] { "Xenonlicht rechts" }),
                    Ident(
                        "body.alc-ds2",
                        "body.adaptive-light",
                        "Adaptive Light Control ALC",
                        "ALC_DS2",
                        "ALC_DS2.prg",
                        "C282E112CA8122F5FBA472AB7D72D71435152DC9CE5C182F20E0C45A44259CAF",
                        "discover-body-alc-ds2",
                        new[] { "Adaptives Kurvenlicht" }),
                    Probe(
                        "parking.pdcact",
                        "parking.pdc",
                        "Park Distance Control aktuell",
                        "PDCACT",
                        "pdcact.prg",
                        "4CDCC2C128F55D971F56012DB84AF909A721BE2080778EBEFB97E291BB0DC334",
                        "discover-parking-pdcact",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Park Distance Control" }),
                    Probe(
                        "parking.pdce38",
                        "parking.pdc",
                        "Park Distance Control DS2",
                        "PDCE38",
                        "PDCE38.prg",
                        "525F7D254E86F6C38EB7CA6637463EEAD7AFBF28AB9246E1C4937B7C14F8CC2F",
                        "discover-parking-pdce38",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Park Distance Control" }),
                    Probe(
                        "infotainment.radio",
                        "infotainment.radio",
                        "Radio",
                        "RADIO",
                        "radio.prg",
                        "8133E31B084272161A33075C603CC423761132EEF9C85C0AEFC88B261C6D6252",
                        "discover-infotainment-radio",
                        "IDENT",
                        new[]
                        {
                            "JOB_STATUS", "ID_BMW_NR", "ID_HW_NR", "ID_SW_NR",
                            "ID_GERAETE_NAME"
                        },
                        Empty,
                        4000,
                        new[] { "Radio" }),
                    Ident(
                        "infotainment.monitor-topnav",
                        "infotainment.monitor",
                        "Bordmonitor Topnavigation",
                        "BMBT46TN",
                        "BMBT46TN.prg",
                        "75512935A41BAFAA68FCD0E7C4A21FC31A1B4237F14488903C7941577869D0E1",
                        "discover-infotainment-monitor-topnav",
                        new[] { "Bordmonitor" }),
                    Ident(
                        "infotainment.monitor-radionav",
                        "infotainment.monitor",
                        "Bordmonitor Radionavigation",
                        "BMBT46RN",
                        "BMBT46RN.prg",
                        "F2D43B783533DA956DA29D67415E89D9F007AC89212C71F9A41E2A5DEB5450A3",
                        "discover-infotainment-monitor-radionav",
                        new[] { "Bordmonitor" }),
                    Ident(
                        "infotainment.monitor-mir",
                        "infotainment.monitor",
                        "Bordmonitor Bedienteil MIR",
                        "BMBT_MIR",
                        "BMBT_MIR.prg",
                        "D7D690D10BA25057C0BB5517F68AB75FB57FD0714C4D80CE0B79C6CAD6C7D591",
                        "discover-infotainment-monitor-mir",
                        new[] { "Bordmonitor" }),
                    Ident(
                        "infotainment.monitor-wide46",
                        "infotainment.monitor",
                        "Widescreen Bordmonitor E46",
                        "BM46WIDE",
                        "BM46WIDE.prg",
                        "2147162ECF82EA85DFEC32AE28DB07D8A43B4EFA8440AFD03DBD73EA6A3ACC06",
                        "discover-infotainment-monitor-wide46",
                        new[] { "Bordmonitor" }),
                    Ident(
                        "infotainment.monitor-wide",
                        "infotainment.monitor",
                        "Widescreen Bordmonitor",
                        "BM_WIDE",
                        "BM_WIDE.prg",
                        "404CCF22095726FAE44560491013BA65003DF1FA21D2C02E4B94B2E5B6255247",
                        "discover-infotainment-monitor-wide",
                        new[] { "Bordmonitor" }),
                    Ident(
                        "infotainment.cdc46",
                        "infotainment.cdc",
                        "CD-Wechsler E46",
                        "CDC_46",
                        "CDC_46.prg",
                        "16E37C2C4D4418D5D8A31D0F06187C9364C8C20082C5048ADC24E03AA7345264",
                        "discover-infotainment-cdc46",
                        new[] { "CD-Wechsler" }),
                    Probe(
                        "infotainment.cdc",
                        "infotainment.cdc",
                        "CD-Wechsler DS2",
                        "CDC",
                        "CDC.prg",
                        "08F5A0323A1FC7689FA729CCBC8799D5ED052DAE74F9C6169FDB6462824F6592",
                        "discover-infotainment-cdc",
                        "SER_NR_DOM_LESEN",
                        new[] { "JOB_STATUS", "SER_NR_DOM" },
                        Empty,
                        4000,
                        new[] { "CD-Wechsler" }),
                    Ident(
                        "infotainment.navigation-mk4-2",
                        "infotainment.navigation",
                        "Navigationsrechner MK4.2",
                        "NAVMK4_2",
                        "NAVMK4_2.prg",
                        "E949ACBF9FD2F9B2A3EB0D20422EEB70AC57D3C4CA0FB2F322B0C896B72DC1AC",
                        "discover-infotainment-navigation-mk4-2",
                        new[] { "Navigation" }),
                    Ident(
                        "infotainment.navigation-mk4",
                        "infotainment.navigation",
                        "Navigationsrechner MK4",
                        "NAVMK4",
                        "NAVMK4.prg",
                        "E09107C0AFD632C06A0C9A6CD7885D79CCD50CBEE9EE9CB12BB15017B0DA6E8F",
                        "discover-infotainment-navigation-mk4",
                        new[] { "Navigation" }),
                    Ident(
                        "infotainment.navigation-mk3",
                        "infotainment.navigation",
                        "Navigationsrechner MK3",
                        "NAVMK3",
                        "NAVMK3.prg",
                        "84B38F723BFCCA2FEBDA803F3101B2B638F0BB23B498A2C04BC4DFC5D8C7F977",
                        "discover-infotainment-navigation-mk3",
                        new[] { "Navigation" }),
                    Ident(
                        "infotainment.navigation-mk2",
                        "infotainment.navigation",
                        "Navigationsrechner MK2",
                        "NAVMK2",
                        "NAVMK2.prg",
                        "22E7FF10FEF166B4D82D28CBB65F3B8AB55A2C134C96D75822CC34312F2E771B",
                        "discover-infotainment-navigation-mk2",
                        new[] { "Navigation" }),
                    Ident(
                        "infotainment.ses",
                        "infotainment.ses",
                        "Spracheingabesystem SES",
                        "SES",
                        "SES.prg",
                        "C3EC68F4A95B3AAF5AA3B2AAC4D9A7FA02BA924C1C9FC671E354F8CE46DD6032",
                        "discover-infotainment-ses",
                        new[] { "Spracheingabesystem" }),
                    Ident(
                        "infotainment.phone-telephone",
                        "infotainment.phone",
                        "BMW Telefon",
                        "TELEFON",
                        "TELEFON.prg",
                        "08F20AC339DE2C787B5BDEA69F2A1777D40B914973B4B2159F93755B298560E8",
                        "discover-infotainment-phone-telephone",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-jbit",
                        "infotainment.phone",
                        "Telefon JBIT",
                        "JBIT",
                        "JBIT.prg",
                        "7FCBF9D1B79590A4358ADF4F3BC91A222AE8F52DF57030A1E0F0E0198A493045",
                        "discover-infotainment-phone-jbit",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-bit",
                        "infotainment.phone",
                        "Telefon BIT",
                        "BIT",
                        "BIT.prg",
                        "7A2C51BB80E2D6B501DA68EE3C9E16650228D19CAD6D0A15E04EC7F3C81E547E",
                        "discover-infotainment-phone-bit",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-bit2",
                        "infotainment.phone",
                        "Telefon BIT2",
                        "BIT2",
                        "BIT2.prg",
                        "194B35EC5A95BF50DD32FD3D7ECF62BD716C28BA63EDAF52C5670AD20799738D",
                        "discover-infotainment-phone-bit2",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-ulf",
                        "infotainment.phone",
                        "Universal-Lade-Freisprecheinrichtung ULF",
                        "ULF",
                        "ULF.prg",
                        "79A10F5A3320D709B5D1E0F6AE5E311188AA3D1736FBDD2A7BA3BC9D360801B2",
                        "discover-infotainment-phone-ulf",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-telibus",
                        "infotainment.phone",
                        "Telefon I-Bus",
                        "TELIBUS",
                        "TELIBUS.prg",
                        "650F4D146B14E0A2CC1527E266D63622010BA59DEFE0C903C23C76B8B4119D3D",
                        "discover-infotainment-phone-telibus",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-telibus2",
                        "infotainment.phone",
                        "Telefon I-Bus 2",
                        "TELIBUS2",
                        "TELIBUS2.prg",
                        "2456B449FA13CE2D7078F369246E552B2ED542E9E0A5AD97BA10086129C11063",
                        "discover-infotainment-phone-telibus2",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.phone-telibus3",
                        "infotainment.phone",
                        "Telefon I-Bus 3",
                        "TELIBUS3",
                        "TELIBUS3.prg",
                        "F23B3CCB86F5D6F12BAA1864013B9E8E6D61C310A1BEB34BFC5401B3205BEF1C",
                        "discover-infotainment-phone-telibus3",
                        new[] { "Telefon" }),
                    Ident(
                        "infotainment.video-ibus",
                        "infotainment.video",
                        "Videomodul I-Bus",
                        "VM5IBUS",
                        "VM5IBUS.prg",
                        "24847888D940A221C65F301694235FE73EEFF06E7639F605E5C2081A676D11C3",
                        "discover-infotainment-video-ibus",
                        new[] { "Videomodul" }),
                    Ident(
                        "infotainment.video",
                        "infotainment.video",
                        "Videomodul",
                        "VIDEOMOD",
                        "VIDEOMOD.prg",
                        "272C59FE1EAA52121561EFA51903FF83EBA34240D0C7EC2529EA098AE7875C03",
                        "discover-infotainment-video",
                        new[] { "Videomodul" }),
                    Probe(
                        "comfort.sm46",
                        "comfort.seat-memory",
                        "Sitzmemory Fahrer SM46",
                        "SM46",
                        "sm46.prg",
                        "1E47EBC07E35EC24ED50E843D0146D4509ED8BE748E03976E2C3326E68CA0093",
                        "discover-comfort-sm46",
                        "IDENT",
                        CommonIdentificationFields,
                        Empty,
                        4000,
                        new[] { "Sitzmemory" }),
                    Ident(
                        "comfort.passenger-seat-b-sm46-4",
                        "comfort.passenger-seat-memory",
                        "Sitzmemory Beifahrer B_SM46_4",
                        "B_SM46_4",
                        "B_SM46_4.prg",
                        "89C78362A69F3134386A02060CD7040A0A3624DE656F2C9C092FE9019D4CB8DD",
                        "discover-comfort-passenger-seat-b-sm46-4",
                        new[] { "Sitzmemory Beifahrer" }),
                    Ident(
                        "comfort.passenger-seat-b-sm46-3",
                        "comfort.passenger-seat-memory",
                        "Sitzmemory Beifahrer B_SM46_3",
                        "B_SM46_3",
                        "B_SM46_3.prg",
                        "605833D4604DF67A2BB98EEB306086758DEBC871BFBD1B5B2FD69312E52F7EB2",
                        "discover-comfort-passenger-seat-b-sm46-3",
                        new[] { "Sitzmemory Beifahrer" }),
                    Ident(
                        "comfort.passenger-seat-easy-e-b",
                        "comfort.passenger-seat-memory",
                        "Sitzmemory Beifahrer EASY_E_B",
                        "EASY_E_B",
                        "EASY_E_B.prg",
                        "FA688C20E583CD0AD82A64367D1117BCD1AE006473112D2BA7E2CB04412D5616",
                        "discover-comfort-passenger-seat-easy-e-b",
                        new[] { "Sitzmemory Beifahrer" }),
                    Ident(
                        "comfort.mirror-driver",
                        "comfort.mirror-driver",
                        "Spiegelmemory Fahrer",
                        "SPM46FT",
                        "SPM46FT.prg",
                        "BA42454B4880116B25699B0EE686A86D7F1AE3517F9EC567A3DC2BBD2BA752DE",
                        "discover-comfort-mirror-driver",
                        new[] { "Spiegelmemory Fahrer" }),
                    Ident(
                        "comfort.mirror-passenger",
                        "comfort.mirror-passenger",
                        "Spiegelmemory Beifahrer",
                        "SPM46BT",
                        "SPM46BT.prg",
                        "339ED2891EF6B37F2A4EA629E3366E8A5DA38767BAB90E61501E6E6C5A2FC00D",
                        "discover-comfort-mirror-passenger",
                        new[] { "Spiegelmemory Beifahrer" }),
                    Ident(
                        "comfort.cruise-gr2",
                        "comfort.cruise-control",
                        "Tempomat GR2",
                        "GR2",
                        "GR2.prg",
                        "06AB53854158A3F00A860DE2ABC5DE8D7ECFB1F306A5C26C9402C1ED551DA40A",
                        "discover-comfort-cruise-gr2",
                        new[] { "Tempomat" }),
                    Ident(
                        "comfort.cruise-fgr2",
                        "comfort.cruise-control",
                        "Tempomat FGR2",
                        "FGR2",
                        "FGR2.prg",
                        "6785F74A1C541E3BFFA12251D84F2334347261AA5A2BF3F66E87E5E824D52D04",
                        "discover-comfort-cruise-fgr2",
                        new[] { "Tempomat" }),
                    Ident(
                        "comfort.cruise-fgr2-5",
                        "comfort.cruise-control",
                        "Tempomat FGR2.5",
                        "FGR2_5",
                        "FGR2_5.prg",
                        "D29326C3E6CBE59B23480A4F3F39D19065AF339C58FD85AAFDF712A10AE444B9",
                        "discover-comfort-cruise-fgr2-5",
                        new[] { "Tempomat" }),
                    Ident(
                        "comfort.cruise-fgr-kw",
                        "comfort.cruise-control",
                        "Tempomat FGR_KW",
                        "FGR_KW",
                        "FGR_KW.prg",
                        "15EDE1739C7702D63D3AE63AAB5ACA05857C98EA1CA75DD81E9C9A86A18FE74C",
                        "discover-comfort-cruise-fgr-kw",
                        new[] { "Tempomat" }),
                    Transmission(
                        "transmission.gs8604",
                        "Getriebesteuerung GS8.60.4",
                        "GS8604",
                        "gs8604.prg",
                        "A5E87FF75B65030818E09CB076F099D8CAC0F91024634C91300FE4F280DDC59F",
                        "discover-transmission-gs8604"),
                    Transmission(
                        "transmission.gs8600",
                        "Getriebesteuerung GS8.60.0",
                        "GS8600",
                        "GS8600.prg",
                        "9480D8C42B06D0B24359902B3101D2D82B5588996CC28A6562749CDCBEE964D5",
                        "discover-transmission-gs8600"),
                    Transmission(
                        "transmission.gs834",
                        "Getriebesteuerung GS8.34",
                        "GS834",
                        "GS834.prg",
                        "9BFC3A8FF6F03CDB8E7D58400D8CB30CE1A6B31F83AFD0C812FFA6CD0165FD4D",
                        "discover-transmission-gs834"),
                    Transmission(
                        "transmission.gs20",
                        "Getriebesteuerung GS20",
                        "GS20",
                        "gs20.prg",
                        "D1D0BAA26E043FCB2A4F13A06C4DF840F655380C7E1519157355CD3BCADA1E50",
                        "discover-transmission-gs20")
                });

        public static IList<DiscoveryProbeDefinition> All
        {
            get { return Probes; }
        }

        public static bool TryFindByCommand(
            string command,
            out DiscoveryProbeDefinition definition)
        {
            foreach (DiscoveryProbeDefinition probe in Probes)
            {
                if (String.Equals(probe.Command, command, StringComparison.Ordinal))
                {
                    definition = probe;
                    return true;
                }
            }

            definition = null;
            return false;
        }

        private static DiscoveryProbeDefinition Ident(
            string moduleKey,
            string familyKey,
            string displayName,
            string sgbd,
            string prgFile,
            string sha256,
            string command,
            string[] diagnosticGroups)
        {
            return Probe(
                moduleKey,
                familyKey,
                displayName,
                sgbd,
                prgFile,
                sha256,
                command,
                "IDENT",
                CommonIdentificationFields,
                Empty,
                4000,
                diagnosticGroups);
        }

        private static DiscoveryProbeDefinition Transmission(
            string moduleKey,
            string displayName,
            string sgbd,
            string prgFile,
            string sha256,
            string command)
        {
            return Probe(
                moduleKey,
                "transmission.egs",
                displayName,
                sgbd,
                prgFile,
                sha256,
                command,
                "IDENT",
                CommonIdentificationFields,
                Empty,
                4000,
                new[] { "Automatikgetriebe" });
        }

        private static DiscoveryProbeDefinition Probe(
            string moduleKey,
            string familyKey,
            string displayName,
            string sgbd,
            string prgFile,
            string sha256,
            string command,
            string job,
            string[] expectedFields,
            string[] vinFields,
            int timeoutMilliseconds,
            string[] diagnosticGroups)
        {
            return new DiscoveryProbeDefinition(
                moduleKey,
                familyKey,
                displayName,
                sgbd,
                prgFile,
                sha256,
                null,
                command,
                job,
                expectedFields,
                vinFields,
                timeoutMilliseconds,
                1,
                diagnosticGroups);
        }
    }
}
