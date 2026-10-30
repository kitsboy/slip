#!/usr/bin/env python3
"""Generates tests/vectors/money-golden.json.

Deliberately an INDEPENDENT implementation: Python's `decimal` with explicit
rounding modes, written from the same stated rules (fiat is integer minor units,
fiat->sats rounds UP, tax is basis points) but not sharing a line of code with the
TypeScript. If the two disagree, one of them is wrong and the test says so.

Run: /usr/bin/python3 scripts/make-money-fixtures.py
"""
import json
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

SATS_PER_COIN = 10**8
MINOR_UNITS = {"USD": 2, "CAD": 2, "EUR": 2, "GBP": 2, "JPY": 0, "KWD": 3, "CLF": 4, "ISK": 0, "VND": 0}
CUR = "USD"


def parse_fiat(text: str, code: str) -> int:
    d = Decimal(text)
    scale = 10 ** MINOR_UNITS[code]
    return int((d * scale).to_integral_value(rounding=ROUND_CEILING if False else ROUND_HALF_UP))


def ceil_div(a: int, b: int) -> int:
    return -((-a) // b)


def fiat_to_sats(fiat_minor: int, rate_minor: int) -> int:
    # ceil(fiat_minor * 1e8 / rate_minor)
    return ceil_div(fiat_minor * SATS_PER_COIN, rate_minor)


def half_up(a: int, b: int) -> int:
    return int(Decimal(a) / Decimal(b).__class__(b))  # unused helper guard


def percent_of(amount: int, bps: int) -> int:
    return int((Decimal(amount) * Decimal(bps) / Decimal(10000)).to_integral_value(rounding=ROUND_HALF_UP))


conversions = []
# Everyday prices across several currencies and rates.
matrix = [
    ("4.50", "USD", "60000.00"),
    ("4.50", "USD", "120000.00"),
    ("0.99", "USD", "60000.00"),
    ("1.00", "USD", "60000.00"),
    ("0.01", "USD", "60000.00"),
    ("12.34", "USD", "61000.00"),
    ("1234.56", "USD", "61000.00"),
    ("99999.99", "USD", "61000.00"),
    ("0.50", "CAD", "83000.00"),
    ("35.00", "CAD", "83000.00"),
    ("3.20", "EUR", "55000.00"),
    ("149.99", "EUR", "55000.00"),
    ("2.80", "GBP", "47000.00"),
    ("1500", "JPY", "9000000"),
    ("350", "JPY", "9000000"),
    ("1", "JPY", "9000000"),
    ("0.750", "KWD", "18000.000"),
    ("12.500", "KWD", "18000.000"),
    ("0.0001", "CLF", "2000.0000"),
    ("1.0000", "CLF", "2000.0000"),
    ("2500", "ISK", "8000000"),
    ("199", "VND", "1500000000"),
]
for fiat, code, rate in matrix:
    fiat_minor = parse_fiat(fiat, code)
    rate_minor = parse_fiat(rate, code)
    conversions.append(
        {
            "fiat": fiat,
            "currency": code,
            "rate": rate,
            "fiatMinor": fiat_minor,
            "expectedSats": fiat_to_sats(fiat_minor, rate_minor),
        }
    )

# Boundary: the rounding direction must be visible. 1 cent at 60k should ceil.
extra_rates = ["1.00", "7.00", "33333.33", "1.07", "999999.99"]
for rate in extra_rates:
    for fiat in ["0.01", "0.07", "1.00", "13.37"]:
        fm = parse_fiat(fiat, CUR)
        rm = parse_fiat(rate, CUR)
        conversions.append(
            {
                "fiat": fiat,
                "currency": CUR,
                "rate": rate,
                "fiatMinor": fm,
                "expectedSats": fiat_to_sats(fm, rm),
            }
        )

# Percent / tax / tip cases
percents = []
for amount, bps in [
    (1000, 875),
    (1000, 500),
    (450, 1000),
    (12345, 1337),
    (99, 875),
    (1, 500),
    (999999, 2500),
    (60000, 1500),
]:
    percents.append({"amount": amount, "bps": bps, "expected": percent_of(amount, bps)})

# Tax-inclusive split must add back exactly to the total
inclusive = []
for total, bps in [(10875, 875), (10500, 500), (450, 1000), (1000, 1300), (99, 875)]:
    net = int((Decimal(total) * Decimal(10000) / Decimal(10000 + bps)).to_integral_value(rounding=ROUND_HALF_UP))
    inclusive.append({"total": total, "bps": bps, "net": net, "tax": total - net})

out = {
    "generatedBy": "scripts/make-money-fixtures.py (Python decimal, independent of the TS implementation)",
    "rules": [
        "fiat is integer minor units, per ISO 4217 exponents",
        "fiat -> sats rounds UP (merchant never short)",
        "percent of an amount rounds half up",
        "tax-inclusive split: net = half_up(total*10000/(10000+bps)); tax = total - net",
    ],
    "conversions": conversions,
    "percents": percents,
    "inclusiveTax": inclusive,
}
with open("tests/vectors/money-golden.json", "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote tests/vectors/money-golden.json — {len(conversions)} conversions, {len(percents)} percents, {len(inclusive)} inclusive-tax")
