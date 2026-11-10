"""Generate and validate an independent, hand-labelled NZ personal-details test corpus.

Run:  python -I make_corpus.py
Writes nz-docs.json next to this file, then re-loads it and runs the self-check.

Written from the labelling rules only (not from any detector's code).
All people, companies and numbers are made up. Check digits are computed here:
  ird / bank  -> python-stdnum (stdnum.nz.ird, stdnum.nz.bankaccount)
  nhi / card  -> own implementations below (old NHI mod-11, Luhn)
"""
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PYLIB = os.path.join(os.path.dirname(HERE), "pylib")
if os.path.isdir(PYLIB):
    sys.path.insert(0, PYLIB)
from stdnum.nz import ird as std_ird  # noqa: E402
from stdnum.nz import bankaccount as std_bank  # noqa: E402

rng = random.Random(20261110)

# --------------------------------------------------------------------------
# Check-digit implementations (own) for NHI and cards
# --------------------------------------------------------------------------
NHI_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # A=1..Z=24, I and O skipped


def nhi_check_char(first6):
    """Return the check digit (str) for the old NHI format, or None if impossible."""
    s = 0
    for ch, w in zip(first6, (7, 6, 5, 4, 3, 2)):
        v = NHI_ALPHA.index(ch) + 1 if ch.isalpha() else int(ch)
        s += v * w
    r = s % 11
    if r == 0:
        return None
    c = 11 - r
    return "0" if c == 10 else str(c)


def nhi_valid(code):
    code = code.strip().upper()
    if not re.fullmatch(r"[A-HJ-NP-Z]{3}\d{4}", code):
        return False
    return nhi_check_char(code[:6]) == code[6]


def luhn_valid(num):
    d = re.sub(r"[ \-]", "", num)
    if not d.isdigit() or not 12 <= len(d) <= 19:
        return False
    tot = 0
    for i, ch in enumerate(reversed(d)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        tot += n
    return tot % 10 == 0


def ird_valid(s):
    return std_ird.is_valid(s)


def bank_valid(s):
    return std_bank.is_valid(s)


# --------------------------------------------------------------------------
# Generators
# --------------------------------------------------------------------------
_used = set()


def _fresh(x):
    if x in _used:
        return False
    _used.add(x)
    return True


def gen_ird_digits(nine=None):
    """Return a valid IRD as a 9-char zero-padded digit string."""
    while True:
        if nine is True:
            base = rng.randint(10_000_000, 14_999_999)  # 9-digit number
        else:
            base = rng.randint(1_000_000, 9_999_999)    # 8-digit number
        for c in range(10):
            s = f"{base * 10 + c:09d}"
            if std_ird.is_valid(s) and _fresh(s):
                return s
        # no valid check digit for this base: try again


def ird_fmt(d9, style):
    eight = d9[0] == "0"
    core = d9[1:] if eight else d9
    if style == "dash":
        return f"{core[:-6]}-{core[-6:-3]}-{core[-3:]}"
    if style == "dashz":
        return f"{d9[:3]}-{d9[3:6]}-{d9[6:]}"
    if style == "space":
        return f"{core[:-6]} {core[-6:-3]} {core[-3:]}"
    if style == "plain":
        return core
    if style == "plainz":
        return d9
    raise ValueError(style)


def IRD(style="dash", nine=None):
    return ird_fmt(gen_ird_digits(nine), style)


def bad_ird(style="dash", nine=None):
    d9 = gen_ird_digits(nine)
    for delta in range(1, 10):
        bad = d9[:-1] + str((int(d9[-1]) + delta) % 10)
        if not std_ird.is_valid(bad):
            return ird_fmt(bad, style)
    raise RuntimeError


BANK_BRANCHES = [("01", "0902"), ("02", "0248"), ("03", "0104"), ("03", "1702"),
                 ("06", "0501"), ("11", "7800"), ("12", "3015"), ("12", "3140"),
                 ("38", "9000"), ("02", "0800"), ("03", "0123")]


def gen_bank_parts():
    while True:
        b, br = rng.choice(BANK_BRANCHES)
        acct = f"{rng.randint(0, 9999999):07d}"
        suf = f"{rng.randint(0, 99):02d}" if rng.random() < 0.8 else f"{rng.randint(0, 99):03d}"
        if std_bank.is_valid(f"{b}-{br}-{acct}-{suf}") and _fresh((b, br, acct, suf)):
            return [b, br, acct, suf]


def bank_fmt(p, sep="-"):
    b, br, acct, suf = p
    if sep == "mixed":
        return f"{b} {br} {acct}-{suf}"
    return sep.join([b, br, acct, suf])


def BANK(sep="-", suffix3=None):
    p = gen_bank_parts()
    if suffix3 is True:
        p[3] = p[3].zfill(3)
    elif suffix3 is False:
        p[3] = p[3][-2:]
    assert std_bank.is_valid(bank_fmt(p, "-"))
    return bank_fmt(p, sep)


def bad_bank(sep="-"):
    p = gen_bank_parts()
    for delta in range(1, 10):
        q = list(p)
        q[2] = q[2][:-1] + str((int(q[2][-1]) + delta) % 10)
        # must fail the bank check AND not accidentally pass Luhn (would look like a card)
        if not std_bank.is_valid(bank_fmt(q, "-")) and not luhn_valid(bank_fmt(q, "")):
            return bank_fmt(q, sep)
    raise RuntimeError


def NHI():
    while True:
        first = "".join(rng.choice(NHI_ALPHA) for _ in range(3)) + f"{rng.randint(0, 999):03d}"
        c = nhi_check_char(first)
        if c is not None and _fresh(first + c):
            return first + c


def bad_nhi():
    good = NHI()
    for delta in range(1, 10):
        bad = good[:6] + str((int(good[6]) + delta) % 10)
        if not nhi_valid(bad):
            return bad
    raise RuntimeError


def card_digits(prefix, length=16):
    while True:
        body = prefix + "".join(str(rng.randint(0, 9)) for _ in range(length - len(prefix) - 1))
        for c in range(10):
            if luhn_valid(body + str(c)):
                s = body + str(c)
                if _fresh(s):
                    return s


def card_fmt(d, style):
    if style == "plain":
        return d
    sep = " " if style == "space" else "-"
    if len(d) == 15:
        return sep.join([d[:4], d[4:10], d[10:]])
    return sep.join(d[i:i + 4] for i in range(0, len(d), 4))


def CARD(prefix="4", style="space", length=16):
    return card_fmt(card_digits(prefix, length), style)


def bad_card(prefix="4", style="space"):
    d = card_digits(prefix)
    bad = d[:-1] + str((int(d[-1]) + 3) % 10)
    assert not luhn_valid(bad) and not std_bank.is_valid(bad)
    return card_fmt(bad, style)


def not_ird_digits(n):
    """n-digit number that is NOT a valid IRD (for invoice/order-number negatives)."""
    while True:
        s = str(rng.randint(10 ** (n - 1), 10 ** n - 1))
        if not std_ird.is_valid(s):
            return s


# --------------------------------------------------------------------------
# Document builder
# --------------------------------------------------------------------------
DOCS = []


class Doc:
    def __init__(self, kind):
        self.kind = kind
        self.text = ""
        self.expected = []
        self.negatives = []
        self.notes = []

    def p(self, typ, value):
        item = {"type": typ, "value": value}
        if item not in self.expected:
            self.expected.append(item)
        return value

    def n(self, value, why, check=None):
        self.negatives.append({"value": value, "why": why})
        return value

    def note(self, s):
        self.notes.append(s)


def doc(kind):
    def wrap(fn):
        DOCS.append((kind, fn))
        return fn
    return wrap


# ==========================================================================
# DOCUMENTS
# ==========================================================================

@doc("email")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"From: {P('name','Rebecca Hall')} <{P('email','rebecca.hall@example.co.nz')}>\n"
        "Sent: Thursday, 6 November 2026 4:52 pm\n"
        "To: Payroll <payroll@example.co.nz>\n"
        "Subject: FW: new starter - Sione\n\n"
        f"Hi {P('name','Rachel')},\n\n"
        f"New starter for Monday - {P('name','Sione Taufa')}. Can you get him set up in payroll pls.\n"
        f"IRD: {P('ird', '49-091-850')}\n"
        f"Bank acct {P('bank', '01-0902-0068389-00')} (ANZ)\n"
        f"Tax code M, KiwiSaver 3%\n"
        f"Mobile {P('phone', '021 455 0193')} / personal email {P('email','sione.taufa88@example.com')}\n\n"
        f"Cheers\n{P('name','Bex')}\n\n"
        "-----Original Message-----\n"
        f"From: {P('name','Sione Taufa')} <{P('email','sione.taufa88@example.com')}>\n"
        "Sent: Wednesday, 5 November 2026 9:14 pm\n"
        f"To: {P('name','Rebecca Hall')}\n"
        "Subject: new starter\n\n"
        "hey Bex, heres my stuff for payroll. sorry took a while, had to find my ird letter lol.\n"
        "IRD 49-091-850, ANZ 01-0902-0068389-00\n"
        f"start monday 10th, see you at {N('7:30','time')}\n"
        "Sione\n"
        "Sent from my iPhone"
    )
    d.p("email", "payroll@example.co.nz")
    d.note("Forwarded thread: the IRD and bank number appear twice; labelled once each by value. "
           "Dates in the email headers are sent dates, not birth dates.")


@doc("slack")
def _(d):
    P = d.p
    v = P("ird", IRD("plainz"))
    d.text = f"@{P('name','mere.h')} quick one, is {v} the right IRD for {P('name','Tane Walker')}?? payslip run closes at 3"
    d.note("'mere.h' is a Slack handle made from a person's name; labelled as name.")


@doc("payroll_note")
def _(d):
    P, N = d.p, d.n
    old = N(bad_bank("-"), "bank-looking number with bad checksum (the 'old' account that bounced)")
    new = P("bank", BANK("-"))
    d.text = (
        f"PAYROLL - bank change\nEmployee: {P('name','Priya Raman')} (emp #{N('10442','employee number')})\n"
        f"Old a/c {old} - payment bounced 12/09, bank says acct doesnt exist\n"
        f"New a/c {new} confirmed by phone {P('phone','(09) 528 4471')}\n"
        f"Effective next pay. Total adj ${N('1,842.60','amount')}\n"
    )


@doc("spreadsheet_tsv")
def _(d):
    P, N = d.p, d.n
    rows = [["Name", "IRD No", "Bank Account", "Tax Code", "Start"]]
    rows.append([P("name", "Liam O'Connor"), P("ird", IRD("dash")), P("bank", BANK("-")), "M", "3/02/2025"])
    rows.append([P("name", "Ana Lealaiauloto"), P("ird", IRD("dash", nine=True)), P("bank", BANK("-", suffix3=True)), "M SL", "17/02/2025"])
    rows.append([P("name", "Hemi Parata"), N(bad_ird("dash"), "IRD-looking number with wrong check digit (typo in source sheet)"), P("bank", BANK("-")), "S", "24/02/2025"])
    rows.append([P("name", "Grace Kim"), P("ird", IRD("plain")), P("bank", BANK("")), "ME", "3/03/2025"])
    d.text = "\n".join("\t".join(r) for r in rows)
    d.note("Start dates are employment start dates, not birth dates.")


@doc("accounts_payable")
def _(d):
    N = d.n
    po = N("4500012904", "purchase order number")
    inv = N("INV-0042817", "invoice number")
    gst = IRD("dash", nine=True)
    d.text = (
        f"AP query - Kauri Office Supplies Ltd\n"
        f"PO {po} raised 4 Sept, invoice {inv} received for ${N('2,316.25','price')} incl GST.\n"
        f"Supplier GST no. {gst}. Qty on invoice {N('48','quantity')} cartons but GRN shows {N('40','quantity')}.\n"
        f"Holding payment until Kauri send a credit note for the 8 short."
    )
    d.note(f"{gst} is the supplier company's GST number (checksum-valid as an IRD number) - deliberately unlabelled because it belongs to a company, not a person.")


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"ACC45 lodged for {P('name','Tipene Rāwiri')}  NHI {P('nhi','ZAA0067')}  DOB {P('dob','14/03/1987')}\n"
        f"Injury: L wrist sprain at work (warehouse), date of injury 02/10/2026.\n"
        f"Claim # {N('10045822371','ACC claim number (not a target type)')} - follow up physio referral w/ {P('name','Dr Anjali Mehta')}.\n"
        f"Pt contact {P('phone','027 384 1102')}"
    )
    d.negatives.append({"value": "02/10/2026", "why": "date of injury, not a birth date"})


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    card = P("card", "4111 1111 1111 1111")
    d.text = (
        f"Ticket #{N('88213','ticket number')} - Payment failed\n"
        f"From: {P('email','j.whitcombe@example.co.nz')}\n\n"
        f"hi there i tried to pay my bill 3 times and it keeps failing, card is {card} exp 08/28. "
        f"can someone call me on {P('phone','022 019 8834')} thanks\n{P('name','Jo Whitcombe')}\n"
        f"{P('address','56 Hinemoa Street, Birkenhead, Auckland 0626')}"
    )


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    lic = P("licence", "DK482913")
    d.text = (
        "TENANCY APPLICATION - 3/18 Bealey Ave\n"
        f"Applicant 1: {P('name','Kate Brennan')}\n"
        f"Date of birth: {P('dob','3 July 1994')}\n"
        f"Drivers licence: {lic}  version {N('512','licence version number')}\n"
        f"Current address: {P('address','Flat 2, 37 Rimu Road, Kelburn, Wellington 6012')} (2 yrs)\n"
        f"Ph: {P('phone','021-776-0451')}   Email: {P('email','kbrennan@example.com')}\n"
        f"Employer: Southern Cross Logistics, weekly income ${N('1,450','income amount')}\n"
        f"Pets: 1 cat\nReferee: {P('name','Martin Shaw')} (previous landlord) {P('phone','(04) 499 3021')}"
    )
    d.negatives.append({"value": "3/18 Bealey Ave", "why": "address of the rental property being applied for, not the applicant's"})
    d.note("'3/18 Bealey Ave' is the advertised rental property (no person lives there in the text) - listed as a negative, though some labellers might count it as an address.")


@doc("school_enrolment")
def _(d):
    P = d.p
    d.text = (
        "Enrolment - Year 3\n"
        f"Student: {P('name','Mia Tuhiwai')}   DOB {P('dob','2018-06-30')}   NHI: {P('nhi', NHI())}\n"
        f"Parent/caregiver: {P('name','Aroha Tuhiwai')} - {P('phone','027 552 9016')}, {P('email','aroha.t@example.co.nz')}\n"
        f"Address: {P('address','14 Kowhai Street, Te Atatu South, Auckland 0610')}\n"
        "Previous school: Rutherford Primary. Allergies: peanuts (EpiPen in bag)."
    )


@doc("teams")
def _(d):
    N = d.n
    d.text = (
        f"anyone know why PO {N('4500013377','purchase order number')} is still showing unreceipted? "
        f"it's the {N('40','quantity')} x {N('HDMI-2M-BLK','product code')} cables, should've come in tues"
    )


@doc("email")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Subject: RE: Kiwisaver opt out\n\n"
        f"Hi {P('name','Daniel')}\n"
        f"Yep got the KS10 form for {P('name','Ella Fisher')}, IRD number on it is {P('ird', IRD('space'))}. "
        f"It's dated 12 Aug so its inside the 8 week window.\n"
        f"Ill process it this week and refund the deductions (${N('312.40','amount')}) back to her nominated account {P('bank', BANK(' '))}.\n\n"
        f"Ngā mihi\n{P('name','Waimarie')}"
    )


@doc("slack")
def _(d):
    N = d.n
    d.text = (
        f"Invoices to chase:\n- {N('INV-20934','invoice number')} Harbourside Cafe ${N('480.00','price')}\n"
        f"- {N('INV-20951','invoice number')} Pukeko Plumbing ${N('1,120.75','price')}\n"
        f"- {N(not_ird_digits(8),'invoice number (8 digits, fails IRD check)')} (old system) ${N('96.60','price')}"
    )


@doc("hr_onboarding")
def _(d):
    P, N = d.p, d.n
    pp = P("passport", "LA204871")
    d.text = (
        f"Onboarding checklist - {P('name','Arjun Patel')}\n"
        "[x] signed IEA\n"
        f"[x] right to work - NZ passport {pp} sighted, expiry 2031\n"
        f"[x] IRD {P('ird', IRD('dashz'))}\n"
        f"[ ] bank details - waiting\n"
        f"[ ] emergency contact - wife {P('name','Neha Patel')} {P('phone','021 0843 7720')}\n"
        f"Laptop asset tag {N('NB-00871','asset tag')}"
    )


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    bad = N(bad_nhi(), "NHI-looking code with bad check digit")
    good = P("nhi", NHI())
    d.text = (
        f"Pt {P('name','Losa Fifita')} rang re repeat script - NHI on the referral was {bad} which doesnt match, "
        f"correct one from NES is {good}. d.o.b {P('dob','21/11/1959')}. Updated PMS."
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    d.text = (
        "AP batch 14 Oct\n"
        f"Supplier\tInvoice\tPO\tAmount\n"
        f"Mainfreight\t{N('MF-883201','invoice number')}\t{N('4500012955','purchase order number')}\t{N('$3,410.00','price')}\n"
        f"Spark NZ\t{N('7023318845','invoice number')}\t-\t{N('$612.35','price')}\n"
        f"Office Max\t{N('OM90021','invoice number')}\t{N('4500012961','purchase order number')}\t{N('$88.20','price')}\n"
        "Total $4,110.55"
    )


@doc("payroll_note")
def _(d):
    P = d.p
    d.text = (
        f"note to self - {P('name','B. Thompson')} ird {P('ird', IRD('plain'))} wrong tax code (was ND, should be M). "
        "back-calc 3 periods + IR correction via payday filing"
    )


@doc("email")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"From: {P('name','Sarah Mitchell')} <{P('email','sarah.mitchell@example.co.nz')}>\n"
        "To: accounts@example.co.nz\n"
        "Subject: refund\n\n"
        f"Hello, I was charged twice for order {N('#55219','order number')}. Please refund to the card I used, ending {N('4444','last 4 digits of card only')}. "
        f"If you need to reach me Im on {P('phone','+64 21 339 812')} during the day.\n\nThanks\n{P('name','Sarah')}"
    )
    d.p("email", "accounts@example.co.nz")
    d.note("accounts@example.co.nz is a role mailbox; labelled as email because the rule says label every email address.")


@doc("spreadsheet_csv")
def _(d):
    P, N = d.p, d.n
    lines = ["first_name,last_name,dob,mobile,email"]
    people = [("Tom", "Hendry", "05/01/1990", "0211234987", "tom.hendry@example.com"),
              ("Lucy", "Ng", "1991-12-22", "027 600 4312", "lucy.ng@example.co.nz"),
              ("Rawiri", "Pomare", "9/9/85", "029 771 2210", "rpomare@example.com")]
    for f, l, dob, m, e in people:
        lines.append(",".join([P("name", f), P("name", l), P("dob", dob), P("phone", m), P("email", e)]))
    d.text = "\n".join(lines)
    d.note("Names split across first_name/last_name columns, labelled per cell. dob column header marks the dates as birth dates.")


@doc("slack")
def _(d):
    N = d.n
    d.text = (
        f"lol the scanner read the barcode as {N(bad_card('4','plain'),'16-digit number failing Luhn (barcode misread)')} again, "
        f"thats not a card number its the carton label. ignore the alert"
    )


@doc("customer_ticket")
def _(d):
    P = d.p
    c = P("card", "5555 5555 5555 4444")
    d.text = (
        "Live chat transcript\n"
        "Agent: Hi, how can I help?\n"
        f"Customer: hey my name's {P('name','Corey Banks')} i want to update my payment card\n"
        "Agent: No problem, please use the secure link I've sent - don't type card numbers into chat\n"
        f"Customer: too late lol its {c}\n"
        "Agent: I'll mask that message now. Please cancel that card with your bank."
    )


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Hi {P('name','Linda')}, following up on the application for {N('42 Fenton Street','rental property address being applied for')}. "
        f"Applicants are {P('name','Josh Turner')} (born {P('dob','12.11.1998')}) and {P('name','Amelia Turner')}. "
        f"Josh's licence no is {P('licence','FH203948')}. "
        f"Bond to be paid from {P('bank', BANK('-'))}. Their current place is {P('address','8 Tui Place, Hamilton East, Hamilton 3216')}. "
        f"Call {P('phone','07-838 1123')} if anything missing"
    )
    d.note("'42 Fenton Street' is the rental property being applied for, listed as a negative; the applicants' own current address is labelled.")


@doc("teams")
def _(d):
    N = d.n
    d.text = (
        "Stocktake variances wk 41\n"
        f"{N('XR204511','product SKU (2 letters + 6 digits, no licence context)')}  -3\n"
        f"{N('BT550982','product SKU (2 letters + 6 digits, no licence context)')}  +12\n"
        f"{N('KLM4471','product code')}  0\n"
        "pls recount the first two before friday"
    )


@doc("hr_onboarding")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "NEW EMPLOYEE FORM\n"
        f"Full name: {P('name','Hēmi Te Awa')}\n"
        f"D.O.B: {P('dob','21st Feb 1979')}\n"
        f"Home address: {P('address','221 Riccarton Road, Riccarton, Christchurch 8041')}\n"
        f"Phone: {P('phone','03 366 0021')}  Mobile: {P('phone','0274 412 889')}\n"
        f"IRD #: {P('ird', IRD('dash', nine=True))}\n"
        f"Bank: {P('bank', BANK('', suffix3=True))}\n"
        f"Emergency contact: {P('name','Mere Te Awa')} (sister) {P('phone','022 581 3307')}\n"
        f"Position: Store Manager  Grade {N('G7','pay grade')}\n"
        "Start date: 17/11/2026\n"
        f"Salary: ${N('72,500','salary amount')} pa\n"
        "Hours: 40 per week, rostered\n"
        "KiwiSaver: member, 4%\n"
        "Student loan: no\n"
        f"Drivers licence: {P('licence','GT508812')} (class 1)\n"
        "Uniform size: L\n"
        "Medical conditions: none disclosed\n"
        "-----\n"
        f"Office use: entered in payroll by {P('name','R. Singh')} on 12/11/2026\n"
        f"Manager sign-off: {P('name','Debbie Lawson')}"
    )
    d.note("Start date and office-use dates are not birth dates.")


@doc("email")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"hey {P('name','Kiri')}\n\nmum's details for the travel insurance form:\n"
        f"{P('name','Margaret Ellis')}\nborn {P('dob','Mar 5 1954')}\npassport {P('passport','RA402331')}\n"
        f"address {P('address','unit 5/112 Great South Rd, Papatoetoe, Auckland 2025')}\n"
        f"policy quote was ${N('284.00','price')}\n\nx {P('name','Jen')}"
    )


@doc("payroll_note")
def _(d):
    P, N = d.p, d.n
    i = P("ird", IRD("dash"))
    d.text = (
        f"Student loan deduction query - {P('name','Ngaire Whaanga')} {i}\n"
        f"SL rate 12% over threshold. Gross ${N('2,140.00','pay amount')} fortnight, threshold ${N('24,128','threshold amount')} pa.\n"
        f"IR asked for SLCIR form, sent {N('7/10','date (not birth)')}."
    )


@doc("spreadsheet_tsv")
def _(d):
    N = d.n
    rows = [["PO", "Line", "Item", "Qty", "Unit", "Total"],
            [N("4500012904", "purchase order number"), "1", N("PAP-A4-80", "product code"), N("120", "quantity"), "6.95", "834.00"],
            ["4500012904", "2", N("TNR-HP-410X", "product code"), "4", "189.00", "756.00"],
            [N("4500013012", "purchase order number"), "1", N("CHR-ERG-02", "product code"), "2", "449.00", "898.00"]]
    d.text = "\n".join("\t".join(r) for r in rows)


@doc("slack")
def _(d):
    P = d.p
    d.text = (
        f"{P('name','jess')}: whats {P('name','Matiu')}'s mobile again\n"
        f"{P('name','tom')}: {P('phone','0215550192')}\n"
        f"{P('name','jess')}: ta"
    )


@doc("accounts_payable")
def _(d):
    P, N = d.p, d.n
    supplier_bank = BANK("-")
    gst = IRD("dash", nine=True)
    d.text = (
        f"New supplier setup - Coastline Signage Ltd\n"
        f"Bank: {supplier_bank} (verified on letterhead + called back on 0800 number)\n"
        f"GST {gst}\n"
        f"Contact: {P('name','Gary Doyle')} {P('email','gary@example.co.nz')}\n"
        f"Payment terms 20th of month following."
    )
    d.note(f"{supplier_bank} is the supplier company's bank account and GST {gst} is the company's GST number - both checksum-valid but deliberately unlabelled as company (not personal) details. Gary Doyle's name and email are labelled.")


@doc("teams")
def _(d):
    P = d.p
    d.text = f"can you ring {P('name','Mrs Kaur')} back on {P('phone','09 263 7740')}, she's asked twice about the refund"


@doc("school_enrolment")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "ENROLMENT FORM (typed up from paper)\n"
        f"child surname: {P('name','FALEOLO')}  first names: {P('name','Junior Ioane')}\n"
        f"date of birth {P('dob','4-3-2019')}  gender M\n"
        f"NHI {P('nhi','ZZZ0016')}\n"
        f"mother {P('name','Tasi Faleolo')} ph {P('phone','020 4093 1187')}\n"
        f"father {P('name','Ioane Faleolo')} ph {P('phone','021 998 3402')}\n"
        f"home {P('address','27 Mahia Road, Manurewa, Auckland 2102')}\n"
        f"room {N('12','classroom number')} / teacher Ms Huang"
    )
    d.p("name", "Ms Huang")


@doc("email")
def _(d):
    N = d.n
    d.text = (
        "Hi team,\n\nReminder the Q3 GST return is due 28 October. "
        f"Total sales ${N('412,880.17','amount')}, GST on sales ${N('53,854.80','amount')}.\n"
        f"Please have all receipts coded by Friday. Xero ref {N('BR-2210-77','reference code')}.\n\nFinance"
    )


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    c = P("card", CARD("4", "plain"))
    d.text = (
        f"caller {P('name','Peter Vu')} read out card {c} to agent before agent could stop him. "
        f"agent did NOT process. advised caller to cancel card. call ref {N('CR-554210','call reference')}"
    )


@doc("hr_onboarding")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"hi {P('name','Steph')} - for {P('name','Jordan Lee')}'s police vetting we need ID, I have his DL {P('licence','EJ771045')} "
        f"and his passport ({P('passport','N482019')}) scanned, saved to the HR drive. "
        f"His dob is {P('dob','17/08/2001')}"
    )


@doc("spreadsheet_csv")
def _(d):
    N = d.n
    d.text = (
        "date,ref,description,debit,credit\n"
        f"01/10/2026,{N('DD-118230','bank transaction reference')},Spark broadband,89.99,\n"
        f"03/10/2026,{N('POS 4471','EFTPOS terminal reference')},Countdown,,\n"
        f"04/10/2026,{N('TFR 20019','transfer reference')},Owner drawings,500.00,\n"
        f"05/10/2026,{N(not_ird_digits(9),'bank statement reference number (9 digits, fails IRD check)')},Customer payment,,1240.00"
    )
    d.note("Transaction dates are not birth dates.")


@doc("acc_health_note")
def _(d):
    P = d.p
    d.text = (
        f"Discharge summary sent to GP for {P('name','William Tane')} ({P('nhi','ZAC5361')}), "
        f"DOB {P('dob','02/04/1948')}. Family contact: son {P('name','Rob Tane')} {P('phone','027 118 4450')}. "
        f"Home: {P('address','3 Kereru Lane, Taupō 3330')}"
    )


@doc("payroll_note")
def _(d):
    N = d.n
    d.text = (
        f"Pay run {N('PR-2026-21','pay run reference')} summary: {N('63','headcount')} employees, gross ${N('148,203.55','amount')}, "
        f"PAYE ${N('31,872.10','amount')}, KS employer ${N('4,446.11','amount')}. Filed via payday filing 09/10."
    )


@doc("slack")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"@channel the new starter {P('name','Fatima Ali')} needs her bank added before thurs: "
        f"{P('bank', BANK('mixed'))}. (she sent it twice, first one was {N(bad_bank('-'),'bank-looking number with bad checksum (typo)')} which is wrong)"
    )


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Pre-tenancy check notes\n"
        f"- {P('name','Dylan Reid')}, licence {P('licence','AB123456')} verified against photo, NZ passport {P('passport','LB771203')} also sighted\n"
        f"- credit check ref {N('CC-77120','credit check reference')} clear\n"
        f"- prev landlord {P('name','Sue Harper')} said rent always on time, contact {P('phone','+64 9 445 2201')}\n"
        f"- current addr {P('address','19 Ponsonby Terrace, Ponsonby, Auckland 1011')}"
    )


@doc("email")
def _(d):
    P, N = d.p, d.n
    i = P("ird", "136-410-132")
    d.text = (
        "Subject: tax refund for my son\n\n"
        f"Hi, my son {P('name','Callum Price')} worked over summer and I think he's owed a refund. "
        f"His IRD is {i} and his bank is {P('bank', BANK('-', suffix3=True))}. "
        f"Could you check if anything else is needed? He was born {P('dob','2008-01-19')} so he's still 18.\n\n"
        f"Regards,\n{P('name','Fiona Price')}\n{P('phone','(03) 477 9012')}"
    )


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Customer {P('name','A. Sharma')} {P('email','asharma@example.com')}: parcel {N('NZ8829014417','courier tracking number')} "
        f"delivered to wrong address. Should have gone to {P('address','45 Domain Road, Whakatāne 3120')}."
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    bad = N(bad_ird("dash", nine=True), "IRD-looking supplier GST number with wrong check digit")
    d.text = (
        f"Invoice from Tidy Gardens rejected - GST number on invoice {bad} doesn't validate, "
        f"asked them to reissue. Inv {N('TG-1043','invoice number')} ${N('575.00','price')}"
    )


@doc("hr_onboarding")
def _(d):
    P = d.p
    d.text = (
        f"Welcome {P('name','Nikau')}! Your buddy for the first week is {P('name','Charlotte Wu')} ({P('email','c.wu@example.co.nz')}). "
        "Parking is in the back lot, swipe card at reception."
    )


@doc("spreadsheet_tsv")
def _(d):
    P = d.p
    hdr = ["Student", "Caregiver", "Phone", "Email", "Address"]
    r1 = [P("name", "Olivia Brown"), P("name", "Karen Brown"), P("phone", "021 404 8812"), P("email", "karenb@example.com"),
          P("address", "9 Matai Street, Riccarton, Christchurch 8011")]
    r2 = [P("name", "Te Ariki Hohaia"), P("name", "Ruth Hohaia"), P("phone", "027-339-0021"), P("email", "ruth.hohaia@example.co.nz"),
          P("address", "88 Ruapehu Drive, Fitzherbert, Palmerston North 4410")]
    # pasted from Excel: address cell wrapped onto a second line in row 3
    r3 = [P("name", "Zoe Clarke"), P("name", "Ben Clarke"), P("phone", "022 765 0198"), P("email", "benclarke@example.com"),
          '"' + P("address", "4 Harbour View Road,\nTe Puru 3575") + '"']
    d.text = "\n".join("\t".join(r) for r in [hdr, r1, r2, r3])
    d.note("Row 3's address contains a line break inside a quoted cell, as Excel pastes it.")


@doc("payroll_note")
def _(d):
    P = d.p
    d.text = (
        f"PAYE - IR330 rec'd for {P('name','michelle mcdonald')}, ird no {P('ird', IRD('plainz'))}, "
        f"tax code M SL. her bank {P('bank', BANK(' ', suffix3=False))}. start date 17 nov"
    )


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Phone triage {N('10:42am','time')}. Caller {P('name','Shane Wilson')} {P('phone','021 667 2093')} re daughter "
        f"{P('name','Ruby Wilson')} (birthday {P('dob','30/09/2016')}, NHI {P('nhi', NHI())}) - fever 39.1 since last night. "
        f"Booked {N('2:15pm','time')} with nurse."
    )


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    bad = N(bad_card("5", "space"), "16-digit card-looking number failing Luhn (customer typo)")
    good = P("card", CARD("5", "space"))
    d.text = (
        f"Customer {P('name','Hannah Ruru')} says the card on file is wrong. Old card on file: {bad} (wouldn't save), "
        f"new card: {good}. Advised her not to send card numbers by email in future."
    )


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Applicant ID checklist\n"
        f"Name ............ {P('name','Siaosi Lemalu')}\n"
        f"DOB ............. {P('dob','11 / 05 / 1989')}\n"
        f"ID type ......... NZ passport\n"
        f"Passport no ..... {P('passport','LH900213')}\n"
        f"Mobile .......... {P('phone','+6421 448 902')}\n"
        f"Weekly rent ..... ${N('620','price')}"
    )


@doc("school_enrolment")
def _(d):
    P = d.p
    d.text = (
        f"Kia ora {P('name','Mrs Henare')}, we've received the enrolment for {P('name','Kahu')}. "
        f"Could you please confirm his date of birth - the form says {P('dob','31/02/2017')} which can't be right. "
        f"Also his NHI number {P('nhi','ZZZ0024')} - is that from the Plunket book?"
    )
    d.note("31/02/2017 is an impossible calendar date but is still written as a birth date, so it is labelled dob.")


@doc("spreadsheet_csv")
def _(d):
    N = d.n
    d.text = (
        "sku,desc,qty_on_hand,reorder_pt,unit_cost\n"
        f"{N('ABC1234','product code shaped like an NHI (3 letters + 4 digits) - fails NHI check')},Widget small,140,50,2.10\n"
        f"{N('MNP5520','product code shaped like an NHI - fails NHI check')},Widget large,62,40,3.85\n"
        f"{N('QRS0002','product code shaped like an NHI - fails NHI check')},Bracket,1200,500,0.42"
    )


@doc("accounts_payable")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Expense claim - {P('name','Grant Hollis')}\n"
        f"Taxi to airport ${N('64.50','price')}, accom ${N('219.00','price')}, meals ${N('71.30','price')}\n"
        f"Reimburse to {P('bank', BANK('-'))}"
    )


@doc("email")
def _(d):
    P = d.p
    d.text = (
        f"Hi {P('name','Tom')}, can u send the contract to {P('name','Leilani')} at {P('email','leilani.k@example.com')} "
        f"not her old work one. thx"
    )


@doc("slack")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "pasting the reject report from the payroll import:\n"
        f"row 4  IRD {N(bad_ird('plain'),'IRD-looking number with wrong check digit (import reject)')}  INVALID CHECK DIGIT\n"
        f"row 9  IRD {P('ird', IRD('plain'))}  OK  ({P('name','Wiremu Kingi')})\n"
        f"row 11 BANK {N(bad_bank(''),'bank-looking number with bad checksum (import reject)')}  INVALID"
    )


@doc("hr_onboarding")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Contractor onboarding\n"
        f"name - {P('name','Lukas Schmidt')}\n"
        f"visa - work visa, passport (German) {N('C01X00T47','foreign passport number - not an NZ passport format')}\n"
        f"NZ IRD - {P('ird', IRD('dash'))}\n"
        f"bank - {P('bank', BANK('-'))}\n"
        f"start - 01/12/2026, rate ${N('95','hourly rate')}/hr"
    )
    d.note("German passport number is not in the NZ passport format and is listed as a negative for the passport type; a stricter labeller might still treat it as personal data.")


@doc("acc_health_note")
def _(d):
    P = d.p
    d.text = f"rang {P('name','Mrs Teina')} to remind re bloods tmrw - no answer, left vm on {P('phone','07 345 2290')}"


@doc("spreadsheet_tsv")
def _(d):
    P, N = d.p, d.n
    rows = [["Employee", "DOB", "Phone", "Licence", "Class"],
            [P("name", "Mark Fitzgerald"), P("dob", "14/07/1976"), P("phone", "021 553 7781"), P("licence", "DF338210"), "1, 2"],
            [P("name", "Wayne Pirihi"), P("dob", "02/02/1983"), P("phone", "027 914 6620"), P("licence", "EK104472"), "1, 4, 5"],
            [P("name", "Sam Cooper"), P("dob", "29/11/1990"), P("phone", "022 403 1185"), P("licence", "GJ559018"), "1"]]
    d.text = "Driver register\n" + "\n".join("\t".join(r) for r in rows)
    d.note("Licence and DOB are identified by the column headers (Licence, DOB) rather than inline keywords.")


@doc("email")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Subject: Fwd: Your order has shipped\n\n"
        "---------- Forwarded message ---------\n"
        "From: Kiwi Outdoors <orders@example.com>\n"
        f"Your order {N('KO-339201','order number')} has shipped and will be delivered to:\n"
        f"{P('name','Daniel Okafor')}\n{P('address','62 Station Road, Ōtāhuhu, Auckland 1062')}\n"
        f"Items: {N('1','quantity')} x Tent 3P ($399.00)\n"
    )
    d.p("email", "orders@example.com")


@doc("teams")
def _(d):
    P = d.p
    d.text = (
        f"{P('name','Anna')} - the IRD for {P('name','Ropata')} is {P('ird', IRD('space', nine=True))} "
        f"not what's in the system, can you fix b4 the run"
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    d.text = (
        "Credit card recon Sept\n"
        f"Card ending {N('1881','last 4 digits only')} - {N('23','count')} transactions, ${N('4,882.10','amount')}\n"
        f"Unmatched: Adobe ${N('84.99','price')}, Uber ${N('32.40','price')}\n"
        f"Statement ref {N(bad_card('4','plain'),'16-digit statement reference failing Luhn')}"
    )


@doc("customer_ticket")
def _(d):
    P = d.p
    d.text = (
        f"Hi its {P('name','Barbara')} from {P('address','12 Seaview Tce, Paraparaumu')}, "
        f"my landline is {P('phone','(04) 297 3318')} and the internet has been down since sunday!!! "
        f"also email {P('email','barb.g@example.co.nz')}"
    )


@doc("school_enrolment")
def _(d):
    N = d.n
    d.text = (
        f"Roll numbers as at 1 Oct: Year 1 {N('48','count')}, Year 2 {N('52','count')}, Year 3 {N('45','count')}. "
        f"Zone enrolments {N('121','count')}, out-of-zone ballot {N('24','count')} places. MOE number {N('1342','school number')}."
    )


@doc("slack")
def _(d):
    P = d.p
    d.text = f"card for the team lunch is {P('card','4012 8888 8888 1881')} exp 11/27 - use it at the cafe, {P('name','Rangi')} approved"


@doc("tenancy_application")
def _(d):
    N = d.n
    d.text = (
        f"Property {N('PR-2201','property reference')} - 2 brm unit, ${N('560','price')}/wk, bond {N('4','count')} weeks. "
        f"{N('11','count')} applications received, viewings Sat 10-11."
    )


@doc("hr_onboarding")
def _(d):
    P = d.p
    d.text = (
        f"From the IR330: {P('name','Tevita Mahe')}\n"
        f"IRD {P('ird', IRD('dashz'))}\n"
        f"bank {P('bank', BANK('mixed', suffix3=True))}\n"
        f"ph {P('phone','0800 438 279')} (this is his work 0800 line, he said use it)"
    )


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Pharmacy note: {P('name','J. Herewini')} DOB {P('dob','1/1/1950')} NHI {P('nhi', NHI())} - "
        f"dispensed {N('30','quantity')} x {N('Metformin 500mg','medicine and dose')}. "
        f"Rx no {N('RX-883021','prescription number')}"
    )


@doc("spreadsheet_csv")
def _(d):
    P, N = d.p, d.n
    lines = ["Name,Card,Expiry,Amount"]
    lines.append(f"{P('name','Ivy Chen')},{P('card', CARD('4','dash'))},09/27,{N('120.00','price')}")
    lines.append(f"{P('name','Ollie Grant')},{P('card', '3782 822463 10005')},01/28,{N('85.50','price')}")
    lines.append(f"{P('name','Ruth Moana')},{N(bad_card('4','dash'),'card-looking number failing Luhn')},03/27,{N('64.00','price')}")
    d.text = "\n".join(lines)
    d.note("3782 822463 10005 is the well-known 15-digit Amex test number (Luhn-valid).")


@doc("payroll_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Final pay - {P('name','Carlos Mendes')}. Leaving 14/11. "
        f"Annual leave owing {N('9.5','days quantity')} days. Pay to {P('bank', BANK('-'))}. "
        f"Send final payslip to {P('email','carlos.mendes@example.com')} as work email will be closed."
    )


@doc("teams")
def _(d):
    N = d.n
    bad = N(bad_ird("dashz"), "IRD-looking number with wrong check digit (failed validation)")
    d.text = f"payroll system rejected {bad} again - pretty sure the employee mistyped it, I've emailed them for a screenshot of myIR"


@doc("customer_ticket")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "Web form submission\n"
        f"Name: {P('name','kerry anne walsh')}\n"
        f"Phone: {P('phone','0277 001 223')}\n"
        f"Email: {P('email','KERRYWALSH@EXAMPLE.CO.NZ')}\n"
        f"Message: hi can i get a quote for {N('3','quantity')} rooms of carpet, approx {N('45m2','area quantity')}. "
        f"im at {P('address','7 Puriri st, Whangārei')}"
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    d.text = (
        f"Duplicate payment check: {N('INV-7781','invoice number')} paid twice on 02/10 and 09/10 (${N('1,980.00','price')}). "
        f"Requested refund from vendor. Vendor ID {N('V00231','vendor id')}."
    )


@doc("slack")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"just a heads up {P('name','Priya')}'s birthday is {P('dob','12 March')} - cake in kitchen!! "
        f"(collecting ${N('5','price')} each)"
    )
    d.note("'12 March' is a birthday without a year; still labelled dob because the text marks it as a birthday.")


@doc("school_enrolment")
def _(d):
    P = d.p
    d.text = (
        f"Hi there, I'd like to enrol my daughter {P('name','Isla McKenzie')} for term 1. "
        f"She was born {P('dob','8 August 2020')}. "
        f"Our address is {P('address','33 Kauri Crescent, Mount Maunganui 3116')}. "
        f"You can reach me on {P('phone','021-338-4479')}.\n{P('name','Fraser McKenzie')}"
    )


@doc("hr_onboarding")
def _(d):
    N = d.n
    d.text = (
        "Induction schedule\n"
        f"Day 1 {N('9:00','time')} H&S, {N('11:00','time')} IT setup, {N('13:30','time')} team lunch\n"
        f"Day 2 systems training (room {N('3B','room number')})\n"
        "Day 3 shadowing"
    )


@doc("acc_health_note")
def _(d):
    P, N = d.p, d.n
    d.text = (
        f"Physio referral\nPatient: {P('name','Eru Waaka')}\nDOB: {P('dob','1972-10-05')}\n"
        f"NHI: {N(bad_nhi(),'NHI-looking code with bad check digit (as written on the referral)')}\n"
        f"Address: {P('address','16 Rata St, Gisborne 4010')}\n"
        f"Phone: {P('phone','06 867 4401')}\n"
        "Note: NHI on referral doesn't validate - please confirm with GP."
    )


@doc("email")
def _(d):
    P = d.p
    d.text = (
        f"Hi {P('name','Lisa')}\n\nPlease update my direct debit to my new account {P('bank', BANK('', suffix3=False))} from next month.\n"
        f"My customer number is in the subject line.\n\nKind regards\n{P('name','Robert Ngata')}\n"
        f"{P('address','2/44 Clyde Quay, Oriental Bay, Wellington 6011')}"
    )


@doc("spreadsheet_tsv")
def _(d):
    N = d.n
    rows = [["Invoice", "Customer", "Date", "Due", "Amount", "Status"],
            [N("INV-30112", "invoice number"), "Kowhai Builders Ltd", "02/10/2026", "20/10/2026", N("4,210.00", "price"), "Paid"],
            [N("INV-30113", "invoice number"), "Tui Electrical", "03/10/2026", "20/10/2026", N("880.50", "price"), "Overdue"],
            [N("INV-30114", "invoice number"), "Harbour Dental", "03/10/2026", "20/10/2026", N("1,120.00", "price"), "Sent"]]
    d.text = "\n".join("\t".join(r) for r in rows)
    d.note("Invoice and due dates are not birth dates; customers are companies.")


@doc("customer_ticket")
def _(d):
    P = d.p
    d.text = (
        f"Customer complaint escalated from {P('name','Ahmed Hassan')}. He provided his licence number {P('licence','HM 402917')} "
        f"for the rental agreement and is upset it was printed on the receipt."
    )
    d.note("Licence written with a space between letters and digits (HM 402917).")


@doc("tenancy_application")
def _(d):
    P, N = d.p, d.n
    d.text = (
        "re: bond lodgement\n"
        f"tenant {P('name','Georgia Smith')} (ID: passport {P('passport','EA330918')}) paid ${N('2,480','price')} bond into trust a/c. "
        f"Refund details at end of tenancy: {P('bank', BANK('-'))}. Tenant mobile {P('phone','+64 27 590 1123')}."
    )


@doc("payroll_note")
def _(d):
    N = d.n
    d.text = (
        "Payroll calendar 2027 - fortnightly, pay day Wed.\n"
        f"Cut-off Mon {N('12pm','time')}. Public hols: Waitangi Day, Easter, Matariki ({N('9 July','date (public holiday)')})."
    )


@doc("slack")
def _(d):
    P = d.p
    d.text = (
        f"FYI {P('name','Nina Kowalski')} new number is {P('phone','022 7001 455')} and her personal email is "
        f"{P('email','nina.k.1990@example.com')} (for the xmas party invite)"
    )


@doc("accounts_payable")
def _(d):
    N = d.n
    po1, po2, po3 = "4500013201", "4500013218", "4500013240"
    gst = IRD("dashz", nine=True)
    lines = [
        "AGED PAYABLES - as at 31/10/2026 (exported from Xero, pasted)",
        "",
        "Supplier\tRef\tPO\tCurrent\t30 days\t60 days\t90+",
        f"Bluebird Packaging\t{N('BB-44021','invoice number')}\t{N(po1,'purchase order number')}\t1,240.00\t\t\t",
        f"Bluebird Packaging\t{N('BB-44108','invoice number')}\t{N(po2,'purchase order number')}\t\t880.40\t\t",
        f"Southern Freight\t{N(not_ird_digits(8),'invoice number (8 digits, fails IRD check)')}\t-\t3,915.75\t\t\t",
        f"Southern Freight\t{N(not_ird_digits(9),'invoice number (9 digits, fails IRD check)')}\t-\t\t\t412.00\t",
        f"Kea Cleaning Co\tKC0091\t{N(po3,'purchase order number')}\t460.00\t460.00\t\t",
        "Kea Cleaning Co\tKC0084\t-\t\t\t\t460.00",
        "Matariki Print\tMP-2210\t-\t\t2,105.60\t\t",
        "",
        "TOTALS\t\t\t5,615.75\t3,446.00\t412.00\t460.00",
        "",
        "Notes",
        f"- Kea Cleaning 90+ is disputed (cleaners missed {N('3','count')} visits in July)",
        f"- Southern Freight 60 day: waiting on POD for con note {N('SF77120044','consignment note number')}",
        f"- Matariki Print GST no. on invoice is {gst}, matches NZBN register",
        f"- Bluebird credit {N('CN-0081','credit note number')} for ${N('120.00','price')} not yet applied",
        "- pay run Wed 5th, cap $10k this week",
        "",
        "Next steps: approve in Xero by Tue 4pm, AP to batch Wed am.",
    ]
    d.text = "\n".join(lines)
    d.note(f"{gst} is Matariki Print's company GST number (checksum-valid as an IRD number) - deliberately unlabelled because it is a company's, not a person's.")


# ==========================================================================
# Build, write, self-check
# ==========================================================================

def build():
    out = []
    for i, (kind, fn) in enumerate(DOCS, 1):
        d = Doc(kind)
        fn(d)
        out.append({"id": f"d{i:03d}", "kind": kind, "text": d.text,
                    "expected": d.expected, "negatives": d.negatives, "notes": " ".join(d.notes)})
    return out


# --- format sanity checks per type ---------------------------------------
PHONE_RE = re.compile(r"^(\+64[ ]?\d{1,2}|\(0\d\)|0\d{1,3}|0800|0508)[ \-]?[\d \-]{6,11}$")
DOB_KW = re.compile(r"(dob|d\.o\.b|born|birth|birthday)", re.I)


def check_value(item, text):
    t, v = item["type"], item["value"]
    if t == "ird":
        assert ird_valid(v), f"ird invalid {v}"
    elif t == "bank":
        assert bank_valid(v), f"bank invalid {v}"
    elif t == "nhi":
        assert nhi_valid(v), f"nhi invalid {v}"
    elif t == "card":
        assert luhn_valid(v), f"card fails luhn {v}"
    elif t == "licence":
        assert re.fullmatch(r"[A-Z]{2} ?\d{6}", v), v
        i = text.index(v)
        header = text.split("\n")[1] if text.startswith("Driver register") else ""
        assert re.search(r"licen[cs]e|\bDL\b", text[max(0, i - 60):i] + header, re.I), f"licence context {v}"
    elif t == "passport":
        assert re.fullmatch(r"[A-Z]{1,2}\d{6}", v), v
        i = text.index(v)
        assert re.search(r"passport", text[max(0, i - 80):i], re.I), f"passport context {v}"
    elif t == "dob":
        i = text.index(v)
        window = text[max(0, i - 40):i]
        assert DOB_KW.search(window) or "dob" in text.lower(), f"dob context {v}"
    elif t == "email":
        assert re.fullmatch(r"[\w.+-]+@example\.(co\.nz|com)", v, re.I), v
    elif t == "phone":
        assert PHONE_RE.match(v), f"phone format {v}"
    elif t in ("name", "address"):
        assert v.strip() == v and v
    else:
        raise AssertionError(f"unknown type {t}")


def negative_passes_any_check(v):
    """Return the list of checks a negative value would PASS (must be empty)."""
    hits = []
    digits = re.sub(r"[ \-]", "", v)
    if digits.isdigit() and len(digits) in (8, 9) and ird_valid(v):
        hits.append("ird")
    if bank_valid(v):
        hits.append("bank")
    if re.fullmatch(r"[A-Z]{3}\d{4}", v) and nhi_valid(v):
        hits.append("nhi")
    if digits.isdigit() and 13 <= len(digits) <= 19 and luhn_valid(v):
        hits.append("card")
    return hits


def covered(text, start, end, values):
    for val in values:
        for m in re.finditer(re.escape(val), text):
            if m.start() <= start and end <= m.end():
                return True
    return False


def leak_scan(doc):
    """Find checksum-valid / email-shaped strings in the text that are not labelled."""
    text = doc["text"]
    labelled = [e["value"] for e in doc["expected"]]
    leaks = []
    for m in re.finditer(r"[\w.+-]+@[\w-]+(\.[\w-]+)+", text):
        if not covered(text, m.start(), m.end(), labelled):
            leaks.append(("email", m.group()))
    for m in re.finditer(r"(?<![\w-])\d{2,3}[- ]?\d{3}[- ]?\d{3}(?![\w-])", text):
        if ird_valid(m.group()) and not covered(text, m.start(), m.end(), labelled):
            leaks.append(("ird", m.group()))
    for m in re.finditer(r"(?<![\w-])\d{2}[- ]?\d{3,4}[- ]?\d{7}[- ]?\d{2,3}(?![\w-])", text):
        if bank_valid(m.group()) and not covered(text, m.start(), m.end(), labelled):
            leaks.append(("bank", m.group()))
    for m in re.finditer(r"(?<![\w])\d(?:[ \-]?\d){12,18}(?![\w])", text):
        if luhn_valid(m.group()) and not covered(text, m.start(), m.end(), labelled):
            leaks.append(("card", m.group()))
    for m in re.finditer(r"(?<![A-Za-z])[A-HJ-NP-Z]{3}\d{4}(?!\d)", text):
        if nhi_valid(m.group()) and not covered(text, m.start(), m.end(), labelled):
            leaks.append(("nhi", m.group()))
    return leaks


def cross_type_notes(doc):
    """Labelled values that ALSO pass another type's checksum: worth knowing when scoring."""
    out = []
    for e in doc["expected"]:
        v, t = e["value"], e["type"]
        digits = re.sub(r"[ \-()+]", "", v)
        also = []
        if t != "ird" and digits.isdigit() and len(digits) in (8, 9) and ird_valid(digits):
            also.append("ird")
        if t != "card" and digits.isdigit() and 13 <= len(digits) <= 19 and luhn_valid(digits):
            also.append("card")
        if t != "bank" and digits.isdigit() and len(digits) in (15, 16) and bank_valid(digits):
            also.append("bank")
        if also:
            out.append(f"Labelled {t} '{v}' also passes the {'/'.join(also)} checksum.")
    return out


def self_check(docs):
    problems = []
    ids = set()
    for doc in docs:
        assert doc["id"] not in ids
        ids.add(doc["id"])
        for e in doc["expected"]:
            if e["value"] not in doc["text"]:
                problems.append(f"{doc['id']}: expected value not verbatim: {e}")
            try:
                check_value(e, doc["text"])
            except AssertionError as ex:
                problems.append(f"{doc['id']}: {ex}")
        for n in doc["negatives"]:
            if n["value"] not in doc["text"]:
                problems.append(f"{doc['id']}: negative not verbatim: {n}")
            hits = negative_passes_any_check(n["value"])
            if hits:
                problems.append(f"{doc['id']}: negative {n['value']} passes {hits}")
            if any(n["value"] == e["value"] for e in doc["expected"]):
                problems.append(f"{doc['id']}: value both expected and negative: {n['value']}")
        for kind, val in leak_scan(doc):
            if val not in doc["notes"]:
                problems.append(f"{doc['id']}: unlabelled {kind}-valid string not explained in notes: {val}")
    return problems


def main():
    docs = build()
    for doc in docs:
        extra = cross_type_notes(doc)
        if extra:
            doc["notes"] = (doc["notes"] + " " + " ".join(extra)).strip()
    path = os.path.join(HERE, "nz-docs.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

    # reload from disk and check the real file, not the in-memory objects
    with open(path, encoding="utf-8") as f:
        loaded = json.load(f)
    problems = self_check(loaded)

    counts = {}
    for doc in loaded:
        for e in doc["expected"]:
            counts[e["type"]] = counts.get(e["type"], 0) + 1
    n_neg = sum(len(doc["negatives"]) for doc in loaded)
    no_pii = [doc["id"] for doc in loaded if not doc["expected"]]
    print(f"documents: {len(loaded)}")
    print("labels per type:", json.dumps(dict(sorted(counts.items()))))
    print(f"total labels: {sum(counts.values())}")
    print(f"negatives: {n_neg}")
    print(f"docs with no personal detail: {len(no_pii)} ({100 * len(no_pii) / len(loaded):.0f}%)")
    print(f"docs with any negative: {sum(1 for d in loaded if d['negatives'])}")
    lines = [len(d["text"].splitlines()) for d in loaded]
    print(f"lines per doc: min {min(lines)} max {max(lines)}")
    if problems:
        print("SELF-CHECK FAILED:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("SELF-CHECK PASSED: every expected/negative value occurs verbatim; every ird/bank valid per python-stdnum; "
          "every nhi/card valid per own check; every negative fails all checksums; no unlabelled checksum-valid or email strings.")


if __name__ == "__main__":
    main()
