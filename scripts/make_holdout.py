"""Blind HOLDOUT set (30 docs, h001-h030) for the NZ personal-details detector.

Run:  python -I make_holdout.py
Same rules, label format and self-checks as make_corpus.py (whose generators and
validators it imports), plus: no labelled/negative value and no sentence may be
reused from nz-docs.json. Writes nz-docs-holdout.json next to this file.
"""
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # -I drops the script dir from sys.path; add it explicitly
import make_corpus as m  # noqa: E402

m.rng = random.Random(30302026)   # different seed from the main set
m.DOCS.clear()                    # keep only holdout docs
doc, Doc = m.doc, m.Doc
IRD, BANK, NHI, CARD = m.IRD, m.BANK, m.NHI, m.CARD
bad_ird, bad_bank, bad_nhi, bad_card, not_ird = m.bad_ird, m.bad_bank, m.bad_nhi, m.bad_card, m.not_ird_digits

# pre-load the generator's "used" set with every value already in the main set
MAIN = json.load(open(os.path.join(HERE, "nz-docs.json"), encoding="utf-8"))
for d0 in MAIN:
    for e in d0["expected"] + d0["negatives"]:
        m._used.add(re.sub(r"[ \-]", "", e["value"]))


# ==========================================================================
# HOLDOUT DOCUMENTS
# ==========================================================================

@doc("email")
def _(d):
    P, N = d.p, d.n
    i = P("ird", IRD("space", nine=True))
    b = P("bank", BANK(""))
    d.text = (
        f"From: {P('name','Huia Marsden')} <{P('email','huia.marsden@example.com')}>\n"
        "Date: Mon, 2 Nov 2026 08:03\n"
        "Subject: Re: Re: paperwork before I start\n\n"
        "Morena,\n\n"
        "Sorry for the slow reply, the kids had the lurgy all weekend.\n"
        "Here's what HR asked for, hope this is everything:\n\n"
        f"  Full legal name - {P('name','Huia Kathleen Marsden')}\n"
        f"  DOB: {P('dob','07-Jun-1985')}\n"
        f"  IRD - {i}\n"
        f"  bank acct (for wages) {b}\n"
        f"  Cell {P('phone','+64 22 418 3307')}\n\n"
        "I've only got a photo of my IRD letter so if you need the actual letter let me know\n"
        "and I'll bring it in on day one.\n\n"
        f"Ka kite,\n{P('name','Huia')}\n\n"
        f"> On Fri, 30 Oct 2026 at 15:41, {P('name','Craig Tamihana')} wrote:\n"
        "> Kia ora Huia, welcome aboard! Before your first day can you send through\n"
        "> your IRD, bank account for pay and a date of birth for the KiwiSaver form.\n"
        f"> Cheers, {P('name','Craig')}\n"
    )
    d.note("Bank account written with no separators.Email-header dates are not birth dates.")


@doc("teams")
def _(d):
    N = d.n
    d.text = (
        f"Freight update: PO {N('4500021187','purchase order number')} landed at the Wiri DC this morning, "
        f"{N('64','quantity')} cartons of {N('TP-559102','product code shaped like a licence (2 letters + 6 digits, no licence context)')} "
        f"and {N('16','quantity')} of {N('DS-ARM-DUO','product code')}. PO {N('4500021203','purchase order number')} still on the water."
    )


@doc("spreadsheet_tsv")
def _(d):
    P, N = d.p, d.n
    hdr = ["Staff member", "Date of Birth", "IRD number", "Bank a/c", "Mobile"]
    r1 = [P("name", "Matthew Kerr"), P("dob", "19/12/1981"), P("ird", IRD("dashz")), P("bank", BANK("-")), P("phone", "021 762 0094")]
    r2 = [P("name", "Pania Tito"), P("dob", "1 Apr 1996"), P("ird", IRD("plain")), N(bad_bank("-"), "bank-looking number with bad checksum (typo in sheet)"), P("phone", "027 205 6618")]
    r3 = [P("name", "Yusuf Demir"), P("dob", "1988.08.23"), P("ird", IRD("dash", nine=True)), P("bank", BANK("-", suffix3=True)), P("phone", "0220 519 744")]
    d.text = "\n".join("\t".join(r) for r in [hdr, r1, r2, r3])
    d.note("Birth dates are identified by the 'Date of Birth' column header.")


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Nurse note 03/11 - {P('name','Colin Barrett')}, born {P('dob',chr(39).join(['14 Feb ', '66']))}, NHI {P('nhi', NHI())}.\n"
        "Fell off ladder at home, ACC lodged. Dressing changed, review in 5/7.\n"
        f"Lives alone at {P('address','5 Totara Avenue, Levin 5510')}; neighbour checking in daily."
    )
    d.negatives.append({"value": "03/11", "why": "date of the visit, not a birth date"})


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"SUBJ: cant update payment method\n"
        f"cust: {P('name','Ngaio Bell')} / {P('email','ngaio.bell@example.co.nz')}\n"
        f"says portal rejects her card {P('card','4242424242424242')} with error {N('PM-221','error code')}. "
        f"Told her we can't take card numbers over email & sent the secure link. Ticket {N('#71920','ticket number')}."
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    gst = IRD("dashz", nine=True)
    cbank = BANK("-")
    badgst = N(bad_ird("dash", nine=True), "IRD-looking GST number with wrong check digit (old letterhead)")
    d.text = (
        "Vendor master change - Whitebait Electrical Ltd\n"
        f"New GST no: {gst} (old letterhead said {badgst}, that one fails validation)\n"
        f"New bank: {cbank} - confirmed by call-back to the number on our file, not the one in the email\n"
        f"Open invoices: {N('WE-30018','invoice number')}, {N('WE-30022','invoice number')} total ${N('7,604.90','price')}"
    )
    d.note(f"{gst} (company GST number, IRD-checksum-valid) and {cbank} (company bank account, checksum-valid) "
           "belong to Whitebait Electrical Ltd, not a person, so they are deliberately unlabelled.")


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Applicant: {P('name','Dmitri Volkov')}\n"
        f"ID: passport no. {P('passport','K719305')}\n"
        f"DOB {P('dob','23 Jan 1990')}\n"
        f"Ph {P('phone','0211 870 432')}\n"
        f"Moving from {P('address','Unit 3, 9 Ropata Grove, Lower Hutt 5010')}\n"
        f"Wants the {N('Kingsley St','rental property being applied for (partial street name)')} place from 1 Dec, ${N('745','price')} pw"
    )
    d.note("Passport number in the 1-letter + 6-digit form.")


@doc("school_enrolment")
def _(d):
    P = d.p
    d.text = (
        "Enrolment notes - Room 7 (Year 1)\n"
        f"{P('name','Leo Fonoti-Brown')}, DOB {P('dob','03.09.2019')}, NHI {P('nhi', NHI())}\n"
        f"Mum {P('name','Sina Fonoti')} {P('phone','+64 3 352 8890')} / {P('email','sinafonoti@example.com')}\n"
        f"Dad {P('name','Aaron Brown')} (shared care, alt weeks) {P('phone','022 316 7745')}\n"
        f"Home: {P('address','71 Main North Road, Papanui, Christchurch 8053')}"
    )


@doc("slack")
def _(d):
    N = d.n
    d.text = (
        f"ugh the fraud filter flagged the gift card batch again - code {N(bad_card('6','plain'),'16-digit gift card code failing Luhn')} "
        f"isnt even a credit card. {N('250','quantity')} cards loaded, ${N('12,500','amount')} total. whitelisting the range"
    )


@doc("payroll_note")
def _(d):
    P = d.p
    d.text = (
        f"{P('name','Te Rangi Paewai')} - ird {P('ird', IRD('plainz', nine=True))} - new bank {P('bank', BANK('mixed'))} "
        "from pay 24, old acct closed. confirmed w/ him in person tues"
    )


@doc("spreadsheet_csv")
def _(d):
    P = d.p
    lines = ["id,full_name,date_of_birth,phone,email,ird"]
    lines.append(f"1041,{P('name','Bridget Ahern')},{P('dob','1979-03-30')},{P('phone','09-418 2263')},{P('email','b.ahern@example.co.nz')},{P('ird', IRD('plain'))}")
    lines.append(f"1042,{P('name','Manaia Pene')},{P('dob','15/7/02')},{P('phone','02108841763')},{P('email','manaia.p@example.com')},{P('ird', IRD('plainz'))}")
    lines.append(f"1043,{P('name','Oscar Lindqvist')},{P('dob','6 November 1968')},{P('phone','+6427 993 1045')},{P('email','oscar.l@example.com')},{P('ird', IRD('plain', nine=True))}")
    d.text = "\n".join(lines)
    d.note("IRD numbers have no separators; DOB and IRD identified by column headers. Row ids 1041-1043 are record ids, not personal details.")


@doc("customer_ticket")
def _(d):
    N = d.n
    bad1, bad2 = bad_nhi(), bad_nhi()
    d.text = (
        f"Return request RMA-{N('60913','return authorisation number')}: wrong variant shipped. Ordered {N(bad1,'product code shaped like an NHI - fails NHI check')} "
        f"(blue), received {N(bad2,'product code shaped like an NHI - fails NHI check')} (grey). Order {N('W-238814','order number')}, "
        f"tracking {N('CP0092281937NZ','courier tracking number')}. Refund ${N('89.95','price')} once back in stock."
    )


@doc("hr_onboarding")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "PRE-EMPLOYMENT ID CHECK\n"
        f"Candidate .......... {P('name','Shanelle Rapana')}\n"
        f"Born on the {P('dob','2nd of October 1992')}\n"
        f"NZ passport {P('passport','LK305962')} (exp 03/2030)\n"
        f"Driver licence {P('licence','NA771304')}, class 1 full\n"
        f"Address {P('address','12A Beach Road, Castor Bay, Auckland 0620')}\n"
        f"Emergency: partner {P('name','Jamie Rapana')} {P('phone','0274 903 118')}\n"
        f"Checked by {P('name','Hollie Grant')}, ref check score {N('4.5/5','score')}"
    )


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    bad = N(bad_nhi(), "NHI-looking code with bad check digit (as typed by the receptionist)")
    good = P("nhi", NHI())
    d.text = (
        f"Data quality fix: patient {P('name','Agnes Pōmare')} had NHI {bad} in our system - NHI lookup returned no match. "
        f"Correct NHI {good} confirmed from hospital letter. Merged duplicate records {N('PT-44190','patient record id')} and {N('PT-44517','patient record id')}."
    )


@doc("email")
def _(d):
    N = d.n
    d.text = (
        "Hi Accounts,\n\n"
        f"Friendly reminder that invoice {N('KC-2026-0418','invoice number')} for ${N('3,982.50','price')} was due on 31 October.\n"
        f"Your PO ref was {N('4500021399','purchase order number')}. If it's already been paid please disregard.\n\n"
        "Thanks,\nCredit Control\nRimu Timber Supplies Ltd"
    )


@doc("teams")
def _(d):
    P = d.p
    d.text = f"can u call {P('name','Fergus')} back pls, he's on {P('phone','027-640-2219')} - something about his final pay"


@doc("accounts_payable")
def _(d):
    P, N = d.p, d.n
    gst = IRD("dash", nine=True)
    d.text = (
        f"Staff reimbursement - {P('name','Lena Fischer')}\n"
        f"Receipt: Noel Leeming, GST no. {gst}, monitor ${N('329.00','price')}\n"
        f"Pay to Lena's personal acct {P('bank', BANK(' ', suffix3=True))}"
    )
    d.note(f"{gst} is the retailer's GST number on the receipt (company, IRD-checksum-valid) - deliberately unlabelled.")


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    lines = [
        "RENTAL APPLICATION - 2 applicants",
        "",
        "APPLICANT 1",
        f"Name: {P('name','Thomas Wu')}",
        f"Date of Birth: {P('dob','11/06/1993')}",
        f"Driver's License: {P('licence','CW204417')}",
        f"Mobile: {P('phone','021 0477 3810')}",
        f"Email: {P('email','thomas.wu93@example.com')}",
        "",
        "APPLICANT 2",
        f"Name: {P('name','Maia Wu')}",
        f"Date of Birth: {P('dob','28/02/1995')}",
        f"Driver's License: {P('licence','MW880153')}",
        f"Mobile: {P('phone','022 641 9902')}",
        "",
        f"Current address (both): {P('address','27 Sunnyside Road, Mount Albert, Auckland 1025')}",
        f"Current landlord: {P('name','Gwen Ashby')} {P('phone','(09) 846 5512')}",
        f"Combined weekly income: ${N('2,960','income amount')}",
        "Smokers: no   Pets: no",
    ]
    d.text = "\n".join(lines)
    d.note("US spelling 'License' used on this form.")


@doc("payroll_note")
def _(d):
    N = d.n
    d.text = (
        "IMPORT VALIDATION - pay period 22\n"
        f"Records read: {N('214','count')}\n"
        f"Rejected: {N(bad_ird('plainz'),'IRD-looking number with wrong check digit (rejected record)')} - check digit\n"
        f"Rejected: {N(bad_ird('dash'),'IRD-looking number with wrong check digit (rejected record)')} - check digit\n"
        f"Total gross ${N('402,118.36','amount')}, PAYE ${N('87,003.40','amount')}"
    )


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    c = P("card", CARD("2221", "dash"))
    d.text = (
        f"EMAIL FROM CUSTOMER ({P('email','BRENT.HOLLAND@EXAMPLE.COM')}):\n"
        f"pls charge the {N('$1,210','price')} balance to my mastercard {c} exp 04/29 cvv i will phone through. "
        f"- {P('name','BRENT HOLLAND')}"
    )


@doc("school_enrolment")
def _(d):
    P = d.p
    d.text = f"New entrant {P('name','Ariana Smith-Tuhi')} DOB: {P('dob','5/11/18')} NHI {P('nhi', NHI())} - starts after her 5th bday"


@doc("spreadsheet_tsv")
def _(d):
    N = d.n
    rows = [["Code", "Description", "Barcode", "On hand"],
            [N("GV-604411", "product code shaped like a licence (no licence context)"), "Gloves vinyl M", N(bad_card("9", "plain"), "barcode failing Luhn"), "38"],
            [N("FMK1205", "product code shaped like an NHI - fails NHI check") if not m.nhi_valid("FMK1205") else "FMK-1205", "First aid kit", N(bad_card("9", "plain"), "barcode failing Luhn"), "7"],
            [N("HV-220871", "product code shaped like a licence (no licence context)"), "Hi-vis vest L", N(bad_card("9", "plain"), "barcode failing Luhn"), "52"]]
    d.text = "\n".join("\t".join(r) for r in rows)


@doc("acc_health_note")
def _(d):
    P = d.p
    d.text = (
        "Referral letter (extract)\n"
        f"Re: {P('name','Rewi Te Kani')}   d.o.b. {P('dob','19 Sept 1971')}   NHI {P('nhi', NHI())}\n"
        f"{P('address','40 Kowhai Drive, Kawerau 3127')}   ph {P('phone','07 323 6681')}\n"
        f"Dear {P('name','Dr Patel')}, thank you for seeing this pleasant 55 y/o man with ongoing lower back pain..."
    )


@doc("slack")
def _(d):
    P = d.p
    d.text = (
        f"{P('name','Kelly')} posted in #general: \"testing the new POS, used {P('card','5105 1051 0510 5100')} - "
        "that's the test mastercard right?\" (mods pls delete)"
    )
    d.note("5105 1051 0510 5100 is a well-known Mastercard test number; labelled card because it passes Luhn and is written as a card number.")


@doc("email")
def _(d):
    P = d.p
    d.text = (
        "Hi Office,\n"
        f"{P('name','Ruby-Rose')} is leaving at the end of term so could the fees credit be refunded to "
        f"{P('bank', BANK('', suffix3=False))} please. Any questions call me on {P('phone','027 118 0352')}.\n"
        f"Thanks, {P('name','Anahera Walsh')}"
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    d.text = (
        "REMITTANCE ADVICE\n"
        "Payer: Harbourview Motor Lodge Ltd\n"
        f"Payment date 06/11/2026  Ref {N('RA-118204','remittance reference')}\n"
        f"Invoices paid: {N('HC-90311','invoice number')} ${N('1,150.00','price')}; {N('HC-90327','invoice number')} ${N('640.25','price')}\n"
        f"Short-paid {N('HC-90302','invoice number')} by ${N('57.50','price')} (disputed linen charge)"
    )


@doc("hr_onboarding")
def _(d):
    P = d.p
    d.text = f"DL for {P('name','Ana Moengangongo')} is {P('licence','MK440921')}, she can start on the forklift roster once the F endorsement is on it"


@doc("payroll_note")
def _(d):
    P = d.p
    rows = [
        f"{P('name','Isaac Thornton')} | {P('ird', IRD('plain'))} | {P('bank', BANK('', suffix3=False))}",
        f"{P('name','Mele Vaipulu')} | {P('ird', IRD('plainz'))} | {P('bank', BANK('', suffix3=True))}",
        f"{P('name','Gareth Price-Jones')} | {P('ird', IRD('space'))} | {P('bank', BANK('-'))}",
    ]
    d.text = "bank/ird changes for this run (from the forms in the tray):\n" + "\n".join(rows)
    d.note("Rows have no header; IRD and bank recognised by shape and checksum only.")


@doc("customer_ticket")
def _(d):
    P = d.p
    d.text = (
        f"Caller {P('name','Moana Hetaraka')} from {P('address','18 Wharf Street, Ōpōtiki 3122')} said she rang our "
        f"{P('phone','0508 226 773')} line three times with no answer. Call her back on {P('phone','06 315 9047')} after 3pm."
    )
    d.note("0508 226 773 is the company's own support line; labelled phone because the rule says label 0800/0508 numbers.")


@doc("teams")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"reminder {P('name','Kahurangi')} needs her licence renewed - version {N('391','licence version number')} expires on her birthday, "
        f"{P('dob','17 Dec')}. she said she'll do it at AA next week"
    )
    d.note("'17 Dec' is a birthday with no year; labelled dob because it is marked as her birthday. No licence number is given.")


# ==========================================================================
# Checks
# ==========================================================================

DOB_KW = re.compile(r"(dob|d\.o\.b|born|birth|birthday|bday)", re.I)
_base_check_value = m.check_value  # original, kept before patching


def check_value_h(item, text):
    t, v = item["type"], item["value"]
    i = text.index(v)
    line_start = text.rfind("\n", 0, i) + 1
    window = text[max(0, i - 60):i] + "\n" + text.split("\n")[0]  # nearby text + header row
    if t == "licence":
        assert re.fullmatch(r"[A-Z]{2} ?\d{6}", v), v
        assert re.search(r"licen[cs]e|\bDL\b", window, re.I), f"licence context {v}"
    elif t == "passport":
        assert re.fullmatch(r"[A-Z]{1,2}\d{6}", v), v
        assert re.search(r"passport", window, re.I), f"passport context {v}"
    elif t == "dob":
        assert DOB_KW.search(window), f"dob context {v}"
    else:
        _base_check_value(item, text)
    _ = line_start


m.check_value = check_value_h  # self_check() looks this name up at call time


def reuse_problems(docs):
    main_values = {re.sub(r"[ \-]", "", e["value"]).lower() for d0 in MAIN for e in d0["expected"] + d0["negatives"]}
    main_lines = set()
    for d0 in MAIN:
        for line in d0["text"].splitlines():
            if len(line.strip()) >= 20:
                main_lines.add(line.strip())
    main_text = "\n".join(d0["text"] for d0 in MAIN)
    out = []
    for d1 in docs:
        for e in d1["expected"] + d1["negatives"]:
            key = re.sub(r"[ \-]", "", e["value"]).lower()
            if key in main_values:
                out.append(f"{d1['id']}: value reused from main set: {e['value']}")
        for line in d1["text"].splitlines():
            s = line.strip()
            if len(s) >= 20 and (s in main_lines or s in main_text):
                out.append(f"{d1['id']}: line reused from main set: {s}")
    return out


def main():
    docs = []
    for i, (kind, fn) in enumerate(m.DOCS, 1):
        d = Doc(kind)
        fn(d)
        rec = {"id": f"h{i:03d}", "kind": kind, "text": d.text, "expected": d.expected,
               "negatives": d.negatives, "notes": " ".join(d.notes)}
        extra = m.cross_type_notes(rec)
        if extra:
            rec["notes"] = (rec["notes"] + " " + " ".join(extra)).strip()
        docs.append(rec)
    path = os.path.join(HERE, "nz-docs-holdout.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

    with open(path, encoding="utf-8") as f:
        loaded = json.load(f)
    problems = m.self_check(loaded) + reuse_problems(loaded)
    if len(loaded) != 30:
        problems.append(f"expected 30 docs, got {len(loaded)}")

    counts = {}
    for d1 in loaded:
        for e in d1["expected"]:
            counts[e["type"]] = counts.get(e["type"], 0) + 1
    no_pii = [d1["id"] for d1 in loaded if not d1["expected"]]
    lines = [len(d1["text"].splitlines()) for d1 in loaded]
    print(f"documents: {len(loaded)}")
    print("labels per type:", json.dumps(dict(sorted(counts.items()))))
    print(f"total labels: {sum(counts.values())}")
    print(f"negatives: {sum(len(d1['negatives']) for d1 in loaded)} in {sum(1 for d1 in loaded if d1['negatives'])} docs")
    print(f"docs with no personal detail: {len(no_pii)} ({100 * len(no_pii) / len(loaded):.0f}%) {no_pii}")
    print(f"lines per doc: min {min(lines)} max {max(lines)}")
    if problems:
        print("SELF-CHECK FAILED:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("SELF-CHECK PASSED: values verbatim; ird/bank valid per python-stdnum; nhi/card valid per own check; "
          "negatives fail all checksums; no unlabelled checksum-valid/email strings; no value or line reused from nz-docs.json.")


if __name__ == "__main__":
    main()
