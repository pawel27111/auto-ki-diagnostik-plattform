# Static MS43 offline catalog

Generated from `config\ms43-profile.offline.json`.
This is metadata only and is not an executable bridge allowlist.

```text
profileState:     OFFLINE_ONLY
runtimeVerified:  False
executionEnabled: False
SGBD:             MS430DS0
catalog entries:  53
```

## Bordspannung

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_UBATT | STAT_UBATT_WERT | electrical.batteryVoltage | numeric-display | Volt | 0xCB3C, 0xCB54 | static-confirmed, runtime-unverified | True | IPO label/unit: Batteriespannung [Volt]. EDIABAS transport type and scaling remain unverified. |

## Drosselklappe

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_PWG1_WINKEL | STAT_PWG1_WINKEL_WERT | throttle.pedalAngle | numeric-display | °PWG | 0xD3F4, 0xD412 | static-confirmed, runtime-unverified | True | IPO label/unit: PWG-Winkel [degree PWG]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_PWG_POTI_SPANNUNG | STAT_PWG_POTI_SPANNUNG_1_WERT | throttle.pedalSensor1Voltage | numeric-display | V | 0xD490, 0xD4B4 | static-confirmed, runtime-unverified | True | IPO label/unit: PWG-Spannung Poti 1 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_PWG_POTI_SPANNUNG | STAT_PWG_POTI_SPANNUNG_2_WERT | throttle.pedalSensor2Voltage | numeric-display | V | 0xD490, 0xD523 | static-confirmed, runtime-unverified | True | IPO label/unit: PWG-Spannung Poti 2 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_DKP_WINKEL | STAT_DKP_WINKEL_WERT | throttle.angle | numeric-display | °DK | 0xD599, 0xD5B6 | static-confirmed, runtime-unverified | True | IPO label/unit: DKP-Winkel [degree DK]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_MDK_POTI_SPANNUNG | STAT_MDK_POTI_SPANNUNG_1_WERT | throttle.motorSensor1Voltage | numeric-display | V | 0xD633, 0xD657 | static-confirmed, runtime-unverified | True | IPO label/unit: MDK-Spannung Poti 1 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_MDK_POTI_SPANNUNG | STAT_MDK_POTI_SPANNUNG_2_WERT | throttle.motorSensor2Voltage | numeric-display | V | 0xD633, 0xD6C6 | static-confirmed, runtime-unverified | True | IPO label/unit: MDK-Spannung Poti 2 [V]. EDIABAS transport type and scaling remain unverified. |

## Einspritzung

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_EINSPRITZZEIT | STAT_EINSPRITZZEIT_WERT | fuel.injectionTime | numeric-display | ms | 0xD0BC, 0xD0DC | static-confirmed, runtime-unverified | True | IPO label/unit: Einspritzzeit [ms]. EDIABAS transport type and scaling remain unverified. |

## Fahrgeschwindigkeit

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_GESCHWINDIGKEIT | STAT_GESCHWINDIGKEIT_WERT | vehicle.speed | numeric-display | km/h | 0xCBB4, 0xCBD6 | static-confirmed, runtime-unverified | True | IPO label/unit: Geschwindigkeit [km/h]. EDIABAS transport type and scaling remain unverified. |

## Identifikation

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | IDENT | ID_BMW_NR | identification.bmwPartNumber | not statically proven | not statically proven | 0xB35C, 0xB39D | static-confirmed, runtime-unverified | True | IPO label: BMW Teilenummer. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_COD_INDEX | identification.codingIndex | not statically proven | not statically proven | 0xB35C, 0xB3DC | static-confirmed, runtime-unverified | True | IPO label: Codierindex. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_HW_NR | identification.hardwareNumber | not statically proven | not statically proven | 0xB35C, 0xB41A | static-confirmed, runtime-unverified | True | IPO label: HW - Nr. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_DIAG_INDEX | identification.diagnosticIndex | not statically proven | not statically proven | 0xB35C, 0xB45A | static-confirmed, runtime-unverified | True | IPO label: Diagnoseindex. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_BUS_INDEX | identification.busIndex | not statically proven | not statically proven | 0xB35C, 0xB49A | static-confirmed, runtime-unverified | True | IPO label: Busindex. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_DATUM_KW | identification.productionWeek | not statically proven | not statically proven | 0xB35C, 0xB504 | static-confirmed, runtime-unverified | True | IPO label: Herstelldatum KW. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_DATUM_JAHR | identification.productionYear | not statically proven | not statically proven | 0xB35C, 0xB522 | static-confirmed, runtime-unverified | True | IPO label: Herstelldatum Jahr. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_LIEF_NR | identification.supplierNumber | not statically proven | not statically proven | 0xB35C, 0xB570 | static-confirmed, runtime-unverified | True | IPO label: Lieferantennummer. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_SW_NR | identification.softwareNumber | not statically proven | not statically proven | 0xB35C, 0xB5B3 | static-confirmed, runtime-unverified | True | IPO label: Softwarenummer. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_AI_NR | identification.changeIndex | not statically proven | not statically proven | 0xB35C, 0xB5F4 | static-confirmed, runtime-unverified | True | IPO label: Aenderungsindex. EDIABAS transport type is not statically proven. |
| MS430DS0 | IDENT | ID_PROD_NR | identification.productionNumber | not statically proven | not statically proven | 0xB35C, 0xB638 | static-confirmed, runtime-unverified | True | IPO label: Produktionsnummer. EDIABAS transport type is not statically proven. |

## Klopfsensoren

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_KLOPF_ADC1 | STAT_KLOPF_ADC1_WERT | knock.sensor1Voltage | numeric-display | V | 0xD29F, 0xD2BC | static-confirmed, runtime-unverified | True | IPO label/unit: Klopfsensor 1 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_KLOPF_ADC2 | STAT_KLOPF_ADC2_WERT | knock.sensor2Voltage | numeric-display | V | 0xD31C, 0xD339 | static-confirmed, runtime-unverified | True | IPO label/unit: Klopfsensor 2 [V]. EDIABAS transport type and scaling remain unverified. |

## Kuehlmitteltemperatur

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_MOTORTEMPERATUR | STAT_MOTORTEMPERATUR_WERT | engine.coolantTemperature | numeric-display | °C | 0xCDA4, 0xCDC6 | static-confirmed, runtime-unverified | True | IPO label/unit: Kuehlwassertemperatur [degree C]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_KUEHLW_AUSL_TEMPERATUR | STAT_KUEHLW_AUSL_TEMPERATUR_WERT | engine.coolantOutletTemperature | numeric-display | °C | 0xCE3C, 0xCE65 | static-confirmed, runtime-unverified | True | IPO label/unit: Kuehlwasseraustrittstemperatur [degree C]. EDIABAS transport type and scaling remain unverified. |

## Lambda/Gemischadaption

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_L_SONDE | STAT_L_SONDE_WERT | lambda.bank1PreCatalystVoltage | numeric-display | V | 0xDF3E, 0xDF58 | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdasonde vor Kat. Bank 1 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_L_SONDE_H | STAT_L_SONDE_H_WERT | lambda.bank1PostCatalystVoltage | numeric-display | V | 0xDFCE, 0xDFEA | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdasonde hinter Kat. Bank 1 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_L_SONDE_2 | STAT_L_SONDE_2_WERT | lambda.bank2PreCatalystVoltage | numeric-display | V | 0xE078, 0xE094 | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdasonde vor Kat. Bank 2 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_L_SONDE_2_H | STAT_L_SONDE_2_H_WERT | lambda.bank2PostCatalystVoltage | numeric-display | V | 0xE10C, 0xE12A | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdasonde hinter Kat. Bank 2 [V]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LS_VKAT_HEIZUNG_TV_1 | STAT_LS_VKAT_HEIZUNG_TV_1_WERT | lambda.bank1PreCatalystHeaterDutyCyclePercent | numeric-display | % | 0xE1D5, 0xE1FC | static-confirmed, runtime-unverified | True | IPO label/unit: TV Sondenheizung Vorkat Bank 1 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LS_VKAT_HEIZUNG_TV_2 | STAT_LS_VKAT_HEIZUNG_TV_2_WERT | lambda.bank2PreCatalystHeaterDutyCyclePercent | numeric-display | % | 0xE277, 0xE29E | static-confirmed, runtime-unverified | True | IPO label/unit: TV Sondenheizung Vorkat Bank 2 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LS_NKAT_HEIZUNG_TV_1 | STAT_LS_NKAT_HEIZUNG_TV_1_WERT | lambda.bank1PostCatalystHeaterDutyCyclePercent | numeric-display | % | 0xE34D, 0xE374 | static-confirmed, runtime-unverified | True | IPO label/unit: TV Sondenheizung Nachkat Bank 1 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LS_NKAT_HEIZUNG_TV_2 | STAT_LS_NKAT_HEIZUNG_TV_2_WERT | lambda.bank2PostCatalystHeaterDutyCyclePercent | numeric-display | % | 0xE3F0, 0xE417 | static-confirmed, runtime-unverified | True | IPO label/unit: TV Sondenheizung Nachkat Bank 2 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_INT | STAT_INT_WERT | mixture.bank1IntegratorPercent | numeric-display | % | 0xE4DB, 0xE4F1 | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdaintegrator 1 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_INT_2 | STAT_INT_2_WERT | mixture.bank2IntegratorPercent | numeric-display | % | 0xE54F, 0xE567 | static-confirmed, runtime-unverified | True | IPO label/unit: Lambdaintegrator 2 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LAMBDA_ADD_1 | STAT_LAMBDA_ADD_1_WERT | mixture.bank1AdditiveAdaptation | numeric-display | ms | 0xE601, 0xE620 | static-confirmed, runtime-unverified | True | IPO label/unit: Adaptionswert Additiv 1 [ms]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LAMBDA_ADD_2 | STAT_LAMBDA_ADD_2_WERT | mixture.bank2AdditiveAdaptation | numeric-display | ms | 0xE68D, 0xE6AC | static-confirmed, runtime-unverified | True | IPO label/unit: Adaptionswert Additiv 2 [ms]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LAMBDA_MUL_1 | STAT_LAMBDA_MUL_1_WERT | mixture.bank1MultiplicativeAdaptationPercent | numeric-display | % | 0xE75E, 0xE77D | static-confirmed, runtime-unverified | True | IPO label/unit: Adaptionswert Multiplikativ 1 [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LAMBDA_MUL_2 | STAT_LAMBDA_MUL_2_WERT | mixture.bank2MultiplicativeAdaptationPercent | numeric-display | % | 0xE7EF, 0xE80E | static-confirmed, runtime-unverified | True | IPO label/unit: Adaptionswert Multiplikativ 2 [%]. EDIABAS transport type and scaling remain unverified. |

## Leerlauf

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_LL_INTEGRATOR | STAT_LL_INTEGRATOR_WERT | idle.controlIntegratorPercent | numeric-display | % | 0xD16D, 0xD18D | static-confirmed, runtime-unverified | True | IPO label/unit: Leerlaufregler [%]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_LL_STELLER_TV | STAT_LL_STELLER_TV_WERT | idle.actuatorDutyCyclePercent | numeric-display | % | 0xD1FC, 0xD21C | static-confirmed, runtime-unverified | True | IPO label/unit: Tastverhaeltnis LL-Steller [%]. EDIABAS transport type and scaling remain unverified. |

## Luftmasse

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_LMM_MASSE | STAT_LMM_MASSE_WERT | intake.airMass | numeric-display | kg/h | 0xD040, 0xD05C | static-confirmed, runtime-unverified | True | IPO label/unit: Gesamtluftbedarf HLM [kg/h]. EDIABAS transport type and scaling remain unverified. |

## Motordrehzahl

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_MOTORDREHZAHL | STAT_MOTORDREHZAHL_WERT | engine.speed | numeric-display | 1/min | 0xCC64, 0xCC84 | static-confirmed, runtime-unverified | True | IPO label/unit: Motordrehzahl [1/min]. EDIABAS transport type and scaling remain unverified. |

## Temperaturen

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_AN_LUFTTEMPERATUR | STAT_AN_LUFTTEMPERATUR_WERT | intake.airTemperature | numeric-display | °C | 0xCEFF, 0xCF23 | static-confirmed, runtime-unverified | True | IPO label/unit: Ansauglufttemperatur [degree C]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_OEL_TEMPERATUR | STAT_OEL_TEMPERATUR_WERT | engine.oilTemperature | numeric-display | °C | 0xCF8A, 0xCFAB | static-confirmed, runtime-unverified | True | IPO label/unit: Oeltemperatur [degree C]. EDIABAS transport type and scaling remain unverified. |

## VANOS

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_EINLASS | STAT_VANOS_NW_LAGE_EINLASS_IST_WERT | vanos.intakeActualAngle | numeric-display | Grad KW | 0xD758, 0xD7B8 | static-confirmed, runtime-unverified | True | IPO label/unit: NW Istlage-Einlass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_EINLASS | STAT_VANOS_NW_LAGE_EINLASS_SOLL_WERT | vanos.intakeTargetAngle | numeric-display | Grad KW | 0xD758, 0xD833 | static-confirmed, runtime-unverified | True | IPO label/unit: NW Solllage-Einlass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_EINLASS | STAT_VANOS_NW_LAGE_EINLASS_REF_WERT | vanos.intakeReferenceAngle | numeric-display | Grad KW | 0xD758, 0xD8AE | static-confirmed, runtime-unverified | True | IPO label/unit: NW Reflage-Einlass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_AUSLASS | STAT_VANOS_NW_LAGE_AUSLASS_IST_WERT | vanos.exhaustActualAngle | numeric-display | Grad KW | 0xD925, 0xD985 | static-confirmed, runtime-unverified | True | IPO label/unit: NW Istlage-Auslass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_AUSLASS | STAT_VANOS_NW_LAGE_AUSLASS_SOLL_WERT | vanos.exhaustTargetAngle | numeric-display | Grad KW | 0xD925, 0xDA00 | static-confirmed, runtime-unverified | True | IPO label/unit: NW Solllage-Auslass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_LAGE_IST_SOLL_REF_AUSLASS | STAT_VANOS_NW_LAGE_AUSLASS_REF_WERT | vanos.exhaustReferenceAngle | numeric-display | Grad KW | 0xD925, 0xDA7B | static-confirmed, runtime-unverified | True | IPO label/unit: NW Reflage-Auslass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_FLANKENADAPTION | STAT_VANOS_NW_FLANKENADAPTION_EINLASS_WERT | vanos.intakeEdgeAdaptation | numeric-display | Grad KW | 0xDAF6, 0xDB54 | static-confirmed, runtime-unverified | True | IPO label/unit: NW Flankenadaption-Einlass [Grad KW]. EDIABAS transport type and scaling remain unverified. |
| MS430DS0 | STATUS_VANOS_NW_FLANKENADAPTION | STAT_VANOS_NW_FLANKENADAPTION_AUSLASS_WERT | vanos.exhaustEdgeAdaptation | numeric-display | Grad KW | 0xDAF6, 0xDBDD | static-confirmed, runtime-unverified | True | IPO label/unit: NW Flankenadaption-Auslass [Grad KW]. EDIABAS transport type and scaling remain unverified. |

## Zuendung

| SGBD | Job | Result field | Normalized name | Static type | Unit | IPO offsets | Verification | Read-only candidate | Notes |
|---|---|---|---|---|---|---|---|---:|---|
| MS430DS0 | STATUS_ZUENDWINKEL | STAT_ZUENDWINKEL_WERT | engine.ignitionAngle | numeric-display | °KW | 0xCCE6, 0xCD04 | static-confirmed, runtime-unverified | True | IPO label/unit: Zuendwinkel [degree KW]. EDIABAS transport type and scaling remain unverified. |
