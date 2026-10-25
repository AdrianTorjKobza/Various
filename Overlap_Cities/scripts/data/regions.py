"""ISO 3166-1 alpha-2 country code -> UN M49 sub-region (e.g. "Western Europe")."""

_GROUPS = {
    "Northern Africa": "DZ EG LY MA SD TN EH",
    "Eastern Africa": "IO BI KM DJ ER ET TF KE MG MW MU YT MZ RE RW SC SO SS UG TZ ZM ZW",
    "Middle Africa": "AO CM CF TD CG CD GQ GA ST",
    "Southern Africa": "BW SZ LS NA ZA",
    "Western Africa": "BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG",
    "Caribbean": "AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI",
    "Central America": "BZ CR SV GT HN MX NI PA",
    "South America": "AR BO BV BR CL CO EC FK GF GY PY PE GS SR UY VE",
    "Northern America": "BM CA GL PM US",
    "Central Asia": "KZ KG TJ TM UZ",
    "Eastern Asia": "CN HK MO KP JP MN KR TW",
    "South-eastern Asia": "BN KH ID LA MY MM PH SG TH TL VN",
    "Southern Asia": "AF BD BT IN IR MV NP PK LK",
    "Western Asia": "AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE",
    "Eastern Europe": "BY BG CZ HU PL MD RO RU SK UA",
    "Northern Europe": "AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB",
    "Southern Europe": "AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES XK",
    "Western Europe": "AT BE FR DE LI LU MC NL CH",
    "Australia and New Zealand": "AU CX CC HM NZ NF",
    "Melanesia": "FJ NC PG SB VU",
    "Micronesia": "GU KI MH FM NR MP PW UM",
    "Polynesia": "AS CK PF NU PN WS TK TO TV WF",
    "Antarctica": "AQ",
}

SUBREGION: dict[str, str] = {code: region for region, codes in _GROUPS.items() for code in codes.split()}
