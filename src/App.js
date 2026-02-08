import { useState, useMemo, useCallback, useRef } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const STATUS_OPTIONS = ["Present","Absent","Half Day","Week-Off","Holiday","Sick Leave"];

const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
const getDayName = (year, month, day) => DAY_NAMES[new Date(year, month, day).getDay()];
const formatCurrency = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatDecimal = (n) => Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1);

const defaultPolicy = {
  shiftHours: "9",
  customShift: "",
  weekOffPolicy: "Paid",
  holidayPolicy: "Paid",
  sickLeavePolicy: "Paid up to N days",
  sickLeavePaidDays: 2,
  halfDayRule: "0.5",
  weekOffWorkRule: "Comp-off",
};

const generateAttendance = (month, year) => {
  const days = getDaysInMonth(month, year);
  return Array.from({ length: days }, (_, i) => {
    const dayName = getDayName(year, month, i + 1);
    const isSunday = dayName === "Sunday";
    return {
      date: i + 1,
      day: dayName,
      status: isSunday ? "Week-Off" : "Present",
      workedOnWeekOff: false,
      notes: "",
    };
  });
};

// ─── Reusable Components ───
const Badge = ({ children, color = "neutral" }) => {
  const colors = {
    green: "background: #dcfce7; color: #166534; border: 1px solid #bbf7d0",
    red: "background: #fef2f2; color: #991b1b; border: 1px solid #fecaca",
    blue: "background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe",
    amber: "background: #fffbeb; color: #92400e; border: 1px solid #fde68a",
    neutral: "background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb",
    purple: "background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff",
  };
  return (
    <span style={{ ...parseStyle(colors[color] || colors.neutral), padding: "2px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, letterSpacing: "0.01em", display: "inline-block", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
};

function parseStyle(str) {
  const obj = {};
  str.split(";").forEach(s => {
    const [k, v] = s.split(":").map(x => x?.trim());
    if (k && v) obj[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  });
  return obj;
}

const Select = ({ value, onChange, options, style = {} }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", fontFamily: "inherit", background: "#fff", cursor: "pointer", outline: "none", minWidth: 0, ...style }}>
    {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
  </select>
);

const Input = ({ value, onChange, type = "text", placeholder = "", style = {}, ...rest }) => (
  <input type={type} value={value} onChange={e => onChange(type === "number" ? e.target.value : e.target.value)} placeholder={placeholder} style={{ padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...style }} {...rest} />
);

const Checkbox = ({ checked, onChange, label }) => (
  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }} />
    {label}
  </label>
);

// ─── Main App ───
export default function SalaryCalculator() {
  const now = new Date();
  const [name, setName] = useState("");
  const [empType, setEmpType] = useState("Full-time");
  const [salary, setSalary] = useState("36000");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [policy, setPolicy] = useState(defaultPolicy);
  const [attendance, setAttendance] = useState(() => generateAttendance(now.getMonth(), now.getFullYear()));
  const [showResults, setShowResults] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [activeTab, setActiveTab] = useState("employee");
  const [errors, setErrors] = useState([]);
  const resultsRef = useRef(null);

  const updatePolicy = (key, val) => setPolicy(p => ({ ...p, [key]: val }));

  const handleMonthChange = useCallback((m, y) => {
    const newMonth = parseInt(m);
    const newYear = parseInt(y);
    setMonth(newMonth);
    setYear(newYear);
    setAttendance(generateAttendance(newMonth, newYear));
    setShowResults(false);
  }, []);

  const updateRow = useCallback((idx, field, val) => {
    setAttendance(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (field === "status" && val !== "Week-Off") {
        next[idx].workedOnWeekOff = false;
      }
      return next;
    });
    setShowResults(false);
  }, []);

  const shiftHrs = policy.shiftHours === "Custom" ? (parseFloat(policy.customShift) || 8) : parseFloat(policy.shiftHours);
  const totalDays = getDaysInMonth(month, year);
  const monthlySalary = parseFloat(salary) || 0;

  // ─── Calculation Engine ───
  const calc = useMemo(() => {
    let presentDays = 0, halfDays = 0, weekOffs = 0, holidays = 0, sickLeaves = 0, absents = 0, compOffs = 0;
    let workedWeekOffCount = 0;
    let paidDays = 0;
    let sickLeavePaidUsed = 0;
    const maxPaidSick = policy.sickLeavePolicy === "Paid up to N days" ? (parseInt(policy.sickLeavePaidDays) || 0) : Infinity;

    attendance.forEach(row => {
      switch (row.status) {
        case "Present":
          presentDays++;
          paidDays += 1;
          break;
        case "Half Day":
          halfDays++;
          if (policy.halfDayRule === "0.5") paidDays += 0.5;
          break;
        case "Week-Off":
          weekOffs++;
          if (policy.weekOffPolicy === "Paid") paidDays += 1;
          if (row.workedOnWeekOff) {
            workedWeekOffCount++;
            if (policy.weekOffWorkRule === "Comp-off") {
              compOffs++;
              paidDays += 1;
            }
          }
          break;
        case "Holiday":
          holidays++;
          if (policy.holidayPolicy === "Paid") paidDays += 1;
          break;
        case "Sick Leave":
          sickLeaves++;
          if (policy.sickLeavePolicy === "Paid") {
            paidDays += 1;
            sickLeavePaidUsed++;
          } else if (policy.sickLeavePolicy === "Paid up to N days") {
            if (sickLeavePaidUsed < maxPaidSick) {
              paidDays += 1;
              sickLeavePaidUsed++;
            }
          }
          break;
        case "Absent":
          absents++;
          break;
        default: break;
      }
    });

    const lopDays = totalDays - paidDays;
    const finalSalary = monthlySalary * (paidDays / totalDays);

    // Freelancer
    const workingDays = presentDays + halfDays;
    const totalWorkedHours = (presentDays * shiftHrs) + (halfDays * shiftHrs * 0.5);
    const estimatedWorkingDays = totalDays - weekOffs - holidays;
    const hourlyRate = estimatedWorkingDays > 0 ? monthlySalary / (shiftHrs * estimatedWorkingDays) : 0;
    const freelancerPay = hourlyRate * totalWorkedHours;

    return {
      presentDays, halfDays, weekOffs, holidays, sickLeaves, absents, compOffs,
      workedWeekOffCount, paidDays, lopDays: Math.max(lopDays, 0), finalSalary: Math.max(finalSalary, 0),
      sickLeavePaidUsed, totalWorkedHours, hourlyRate, freelancerPay, estimatedWorkingDays,
    };
  }, [attendance, policy, totalDays, monthlySalary, shiftHrs]);

  // ─── Validation ───
  const validate = () => {
    const errs = [];
    if (!salary || monthlySalary <= 0) errs.push("Monthly salary must be greater than 0.");
    if (calc.paidDays > totalDays) errs.push(`Paid days (${calc.paidDays}) exceed total days in month (${totalDays}).`);
    if (attendance.length !== totalDays) errs.push("Attendance rows don't match days in month.");
    return errs;
  };

  const handleCalculate = () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length === 0) {
      setShowResults(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  };

  // ─── Explanation Text ───
  const explanation = useMemo(() => {
    if (!showResults) return "";
    const isFreelancer = empType === "Freelancer";
    const lines = [];
    lines.push(`Salary Calculation for ${name || "Employee"} — ${MONTHS[month]} ${year}`);
    lines.push("");
    lines.push(`Total days in ${MONTHS[month]}: ${totalDays}`);
    lines.push("");
    if (!isFreelancer) {
      lines.push("Paid Day Breakdown:");
      lines.push(`  • Present days: ${calc.presentDays} × 1.0 = ${calc.presentDays} paid days`);
      if (calc.halfDays > 0) lines.push(`  • Half days: ${calc.halfDays} × ${policy.halfDayRule === "0.5" ? "0.5" : "0 (unpaid)"} = ${policy.halfDayRule === "0.5" ? formatDecimal(calc.halfDays * 0.5) : "0"} paid days`);
      if (calc.weekOffs > 0) lines.push(`  • Week-offs: ${calc.weekOffs} × ${policy.weekOffPolicy === "Paid" ? "1.0 (paid)" : "0 (unpaid)"} = ${policy.weekOffPolicy === "Paid" ? calc.weekOffs : "0"} paid days`);
      if (calc.compOffs > 0) lines.push(`  • Comp-offs (worked on week-off): +${calc.compOffs} paid days`);
      if (calc.holidays > 0) lines.push(`  • Holidays: ${calc.holidays} × ${policy.holidayPolicy === "Paid" ? "1.0 (paid)" : "0 (unpaid)"} = ${policy.holidayPolicy === "Paid" ? calc.holidays : "0"} paid days`);
      if (calc.sickLeaves > 0) {
        if (policy.sickLeavePolicy === "Paid") lines.push(`  • Sick leaves: ${calc.sickLeaves} (all paid) = ${calc.sickLeaves} paid days`);
        else if (policy.sickLeavePolicy === "Paid up to N days") lines.push(`  • Sick leaves: ${calc.sickLeaves} total, ${calc.sickLeavePaidUsed} paid (limit: ${policy.sickLeavePaidDays}), ${calc.sickLeaves - calc.sickLeavePaidUsed} unpaid`);
        else lines.push(`  • Sick leaves: ${calc.sickLeaves} (all unpaid)`);
      }
      if (calc.absents > 0) lines.push(`  • Absents: ${calc.absents} × 0 = 0 paid days`);
      lines.push("");
      lines.push(`Total Paid Days: ${formatDecimal(calc.paidDays)}`);
      lines.push(`LOP Days: ${formatDecimal(calc.lopDays)}`);
      lines.push("");
      lines.push(`Formula: ${formatCurrency(monthlySalary)} × (${formatDecimal(calc.paidDays)} ÷ ${totalDays})`);
      lines.push(`Final Payable Salary: ${formatCurrency(Math.round(calc.finalSalary))}`);
    } else {
      lines.push("Freelancer Hourly Calculation:");
      lines.push(`  • Estimated working days: ${calc.estimatedWorkingDays}`);
      lines.push(`  • Shift hours: ${shiftHrs}`);
      lines.push(`  • Hourly rate: ${formatCurrency(monthlySalary)} ÷ (${shiftHrs} × ${calc.estimatedWorkingDays}) = ${formatCurrency(Math.round(calc.hourlyRate * 100) / 100)}/hr`);
      lines.push(`  • Total worked hours: ${formatDecimal(calc.totalWorkedHours)}`);
      lines.push("");
      lines.push(`Formula: ${formatCurrency(Math.round(calc.hourlyRate * 100) / 100)} × ${formatDecimal(calc.totalWorkedHours)} hrs`);
      lines.push(`Final Pay: ${formatCurrency(Math.round(calc.freelancerPay))}`);
    }
    return lines.join("\n");
  }, [showResults, calc, name, month, year, totalDays, monthlySalary, policy, empType, shiftHrs]);

  // ─── CSV Export ───
  const exportCSV = () => {
    const isFreelancer = empType === "Freelancer";
    let csv = `Salary Report - ${name || "Employee"} - ${MONTHS[month]} ${year}\n\n`;
    csv += `Employee Name,${name}\n`;
    csv += `Employee Type,${empType}\n`;
    csv += `Monthly Salary,${monthlySalary}\n`;
    csv += `Month,${MONTHS[month]} ${year}\n`;
    csv += `Total Days,${totalDays}\n\n`;

    if (!isFreelancer) {
      csv += `Paid Days,${formatDecimal(calc.paidDays)}\n`;
      csv += `LOP Days,${formatDecimal(calc.lopDays)}\n`;
      csv += `Final Salary,${Math.round(calc.finalSalary)}\n\n`;
    } else {
      csv += `Hourly Rate,${Math.round(calc.hourlyRate * 100) / 100}\n`;
      csv += `Total Worked Hours,${formatDecimal(calc.totalWorkedHours)}\n`;
      csv += `Final Pay,${Math.round(calc.freelancerPay)}\n\n`;
    }

    csv += "Attendance Detail\n";
    csv += "Date,Day,Status,Worked on Week-Off,Notes\n";
    attendance.forEach(r => {
      csv += `${r.date},${r.day},${r.status},${r.workedOnWeekOff ? "Yes" : "No"},${r.notes}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salary_report_${(name || "employee").replace(/\s+/g, "_")}_${MONTHS[month]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isFreelancer = empType === "Freelancer";

  // ─── Status colors for attendance table ───
  const statusColor = (s) => {
    switch(s) {
      case "Present": return { bg: "#f0fdf4", text: "#166534" };
      case "Absent": return { bg: "#fef2f2", text: "#991b1b" };
      case "Half Day": return { bg: "#fffbeb", text: "#92400e" };
      case "Week-Off": return { bg: "#eff6ff", text: "#1e40af" };
      case "Holiday": return { bg: "#faf5ff", text: "#6b21a8" };
      case "Sick Leave": return { bg: "#fff7ed", text: "#9a3412" };
      default: return { bg: "#f9fafb", text: "#374151" };
    }
  };

  const tabs = [
    { id: "employee", label: "Employee", icon: "👤" },
    { id: "policy", label: "Policy", icon: "⚙️" },
    { id: "attendance", label: "Attendance", icon: "📋" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(168deg, #f8fafc 0%, #eef2f7 40%, #e8ecf4 100%)", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", color: "#1e293b" }}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "0", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", boxShadow: "0 2px 8px rgba(59,130,246,0.4)" }}>₹</div>
            <div>
              <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>PayCalc Pro</div>
              <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em" }}>ATTENDANCE-BASED SALARY CALCULATOR</div>
            </div>
          </div>
          <div style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>
            {MONTHS[month]} {year} • {totalDays} days
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#fff", borderRadius: 14, padding: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              fontFamily: "inherit", transition: "all 0.2s",
              background: activeTab === t.id ? "linear-gradient(135deg, #2563eb, #3b82f6)" : "transparent",
              color: activeTab === t.id ? "#fff" : "#64748b",
              boxShadow: activeTab === t.id ? "0 2px 8px rgba(37,99,235,0.25)" : "none",
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Error Banner */}
        {errors.length > 0 && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            {errors.map((e, i) => (
              <div key={i} style={{ color: "#991b1b", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>⚠️</span> {e}
              </div>
            ))}
          </div>
        )}

        {/* ── EMPLOYEE TAB ── */}
        {activeTab === "employee" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 4, height: 20, borderRadius: 4, background: "linear-gradient(180deg, #2563eb, #3b82f6)" }}></span>
              Employee Details
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
              <div>
                <label style={labelStyle}>Employee Name</label>
                <Input value={name} onChange={setName} placeholder="e.g. Ravi Kumar" />
              </div>
              <div>
                <label style={labelStyle}>Employee Type</label>
                <Select value={empType} onChange={setEmpType} options={[
                  { value: "Full-time", label: "Full-time (Fixed Salary)" },
                  { value: "Freelancer", label: "Freelancer (Hourly)" },
                ]} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={labelStyle}>Monthly Salary (₹)</label>
                <Input value={salary} onChange={setSalary} type="number" placeholder="e.g. 36000" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }} />
              </div>
              <div>
                <label style={labelStyle}>Month</label>
                <Select value={month} onChange={m => handleMonthChange(m, year)} options={MONTHS.map((m, i) => ({ value: i, label: m }))} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <Input value={year} onChange={y => handleMonthChange(month, y)} type="number" min="2020" max="2030" />
              </div>
            </div>
            <div style={{ marginTop: 20, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, color: "#475569" }}>
              <strong style={{ color: "#1e293b" }}>{MONTHS[month]} {year}</strong> has <strong>{totalDays} days</strong>
              {empType === "Freelancer" && <span> • Freelancer mode uses hourly rate calculation</span>}
            </div>
            <div style={{ marginTop: 18, textAlign: "right" }}>
              <button onClick={() => setActiveTab("policy")} style={btnSecondary}>Next: Policy Settings →</button>
            </div>
          </div>
        )}

        {/* ── POLICY TAB ── */}
        {activeTab === "policy" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 4, height: 20, borderRadius: 4, background: "linear-gradient(180deg, #8b5cf6, #a78bfa)" }}></span>
              Shift &amp; Policy Settings
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
              {/* Shift */}
              <div style={cardStyle}>
                <label style={labelStyle}>Standard Shift Duration</label>
                <Select value={policy.shiftHours} onChange={v => updatePolicy("shiftHours", v)} options={["8","9","10","Custom"]} style={{ width: "100%" }} />
                {policy.shiftHours === "Custom" && (
                  <Input value={policy.customShift} onChange={v => updatePolicy("customShift", v)} type="number" placeholder="Hours" style={{ marginTop: 8 }} />
                )}
              </div>
              {/* Week-off */}
              <div style={cardStyle}>
                <label style={labelStyle}>Week-Off Policy</label>
                <Select value={policy.weekOffPolicy} onChange={v => updatePolicy("weekOffPolicy", v)} options={["Paid","Unpaid"]} style={{ width: "100%" }} />
              </div>
              {/* Holiday */}
              <div style={cardStyle}>
                <label style={labelStyle}>Holiday Policy</label>
                <Select value={policy.holidayPolicy} onChange={v => updatePolicy("holidayPolicy", v)} options={["Paid","Unpaid"]} style={{ width: "100%" }} />
              </div>
              {/* Sick Leave */}
              <div style={cardStyle}>
                <label style={labelStyle}>Sick Leave Policy</label>
                <Select value={policy.sickLeavePolicy} onChange={v => updatePolicy("sickLeavePolicy", v)} options={["Paid","Unpaid","Paid up to N days"]} style={{ width: "100%" }} />
                {policy.sickLeavePolicy === "Paid up to N days" && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Max paid sick days</label>
                    <Input value={policy.sickLeavePaidDays} onChange={v => updatePolicy("sickLeavePaidDays", v)} type="number" min="0" />
                  </div>
                )}
              </div>
              {/* Half Day */}
              <div style={cardStyle}>
                <label style={labelStyle}>Half Day Rule</label>
                <Select value={policy.halfDayRule} onChange={v => updatePolicy("halfDayRule", v)} options={[
                  { value: "0.5", label: "Count as 0.5 paid day" },
                  { value: "0", label: "Count as unpaid" },
                ]} style={{ width: "100%" }} />
              </div>
              {/* Week-off work */}
              <div style={cardStyle}>
                <label style={labelStyle}>Working on Week-Off</label>
                <Select value={policy.weekOffWorkRule} onChange={v => updatePolicy("weekOffWorkRule", v)} options={[
                  { value: "Ignore", label: "Ignore (no extra benefit)" },
                  { value: "Comp-off", label: "Comp-off (+1 paid day)" },
                ]} style={{ width: "100%" }} />
              </div>
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <button onClick={() => setActiveTab("employee")} style={{ ...btnSecondary, background: "transparent", border: "1.5px solid #d1d5db", color: "#475569" }}>← Employee</button>
              <button onClick={() => setActiveTab("attendance")} style={btnSecondary}>Next: Attendance →</button>
            </div>
          </div>
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "attendance" && (
          <div>
            <div style={{ background: "#fff", borderRadius: 16, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 4, height: 20, borderRadius: 4, background: "linear-gradient(180deg, #10b981, #34d399)" }}></span>
                  Daily Attendance — {MONTHS[month]} {year}
                </h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color="green">P: {calc.presentDays}</Badge>
                  <Badge color="red">A: {calc.absents}</Badge>
                  <Badge color="amber">½: {calc.halfDays}</Badge>
                  <Badge color="blue">WO: {calc.weekOffs}</Badge>
                  <Badge color="purple">H: {calc.holidays}</Badge>
                </div>
              </div>

              {/* Quick-fill buttons */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500, alignSelf: "center" }}>Quick fill:</span>
                {["All Present", "Mark Sundays WO", "Reset"].map(action => (
                  <button key={action} onClick={() => {
                    if (action === "All Present") setAttendance(prev => prev.map(r => ({ ...r, status: "Present", workedOnWeekOff: false })));
                    else if (action === "Mark Sundays WO") setAttendance(prev => prev.map(r => r.day === "Sunday" ? { ...r, status: "Week-Off" } : r));
                    else setAttendance(generateAttendance(month, year));
                    setShowResults(false);
                  }} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #d1d5db", background: "#f8fafc", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "#475569", fontFamily: "inherit" }}>
                    {action}
                  </button>
                ))}
              </div>

              {/* Attendance Table */}
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Date", "Day", "Status", ...(policy.weekOffWorkRule !== "Ignore" ? ["WO Work"] : []), "Notes"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((row, idx) => {
                      const sc = statusColor(row.status);
                      const isWeekend = row.day === "Sunday" || row.day === "Saturday";
                      return (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{row.date}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 500, color: isWeekend ? "#2563eb" : "#475569", fontSize: 12 }}>{row.day.slice(0, 3)}</td>
                          <td style={{ padding: "6px 12px" }}>
                            <select value={row.status} onChange={e => updateRow(idx, "status", e.target.value)} style={{
                              padding: "5px 8px", borderRadius: 6, border: "1.5px solid " + sc.text + "33", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                              background: sc.bg, color: sc.text, cursor: "pointer", outline: "none", minWidth: 100,
                            }}>
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          {policy.weekOffWorkRule !== "Ignore" && (
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>
                              {row.status === "Week-Off" ? (
                                <input type="checkbox" checked={row.workedOnWeekOff} onChange={e => updateRow(idx, "workedOnWeekOff", e.target.checked)} style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }} />
                              ) : (
                                <span style={{ color: "#d1d5db" }}>—</span>
                              )}
                            </td>
                          )}
                          <td style={{ padding: "6px 12px" }}>
                            <input value={row.notes} onChange={e => updateRow(idx, "notes", e.target.value)} placeholder="—" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: "inherit", width: "100%", minWidth: 60, outline: "none", color: "#475569", boxSizing: "border-box" }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calculate Button */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <button onClick={handleCalculate} style={{
                padding: "14px 48px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff",
                boxShadow: "0 4px 16px rgba(37,99,235,0.35)", transition: "all 0.2s", letterSpacing: "-0.01em",
              }}>
                Calculate Salary
              </button>
            </div>

            {/* ── RESULTS ── */}
            {showResults && (
              <div ref={resultsRef}>
                {/* Summary Card */}
                <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", borderRadius: 18, padding: "28px 24px", marginBottom: 20, color: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Salary Summary</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{name || "Employee"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Month</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{MONTHS[month]} {year}</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
                    <StatCard label="Monthly Salary" value={formatCurrency(monthlySalary)} />
                    {!isFreelancer ? (
                      <>
                        <StatCard label="Paid Days" value={formatDecimal(calc.paidDays)} accent />
                        <StatCard label="LOP Days" value={formatDecimal(calc.lopDays)} warning={calc.lopDays > 0} />
                        <StatCard label="Final Payable" value={formatCurrency(Math.round(calc.finalSalary))} highlight />
                      </>
                    ) : (
                      <>
                        <StatCard label="Hourly Rate" value={formatCurrency(Math.round(calc.hourlyRate * 100) / 100)} />
                        <StatCard label="Hours Worked" value={formatDecimal(calc.totalWorkedHours)} accent />
                        <StatCard label="Final Pay" value={formatCurrency(Math.round(calc.freelancerPay))} highlight />
                      </>
                    )}
                  </div>
                </div>

                {/* Breakdown */}
                <div style={{ background: "#fff", borderRadius: 16, padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Detailed Breakdown</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <BreakdownRow label="Present" count={calc.presentDays} color="green" />
                    <BreakdownRow label="Half Days" count={calc.halfDays} color="amber" />
                    <BreakdownRow label="Week-Offs" count={calc.weekOffs} color="blue" />
                    <BreakdownRow label="Holidays" count={calc.holidays} color="purple" />
                    <BreakdownRow label="Sick Leaves" count={calc.sickLeaves} sub={policy.sickLeavePolicy === "Paid up to N days" ? `${calc.sickLeavePaidUsed} paid` : null} color="amber" />
                    <BreakdownRow label="Absents" count={calc.absents} color="red" />
                    {calc.compOffs > 0 && <BreakdownRow label="Comp-Offs" count={calc.compOffs} color="green" />}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                  <button onClick={() => setShowExplain(!showExplain)} style={{ ...btnSecondary, flex: 1, minWidth: 160 }}>
                    {showExplain ? "Hide" : "📝 Explain"} Calculation
                  </button>
                  <button onClick={exportCSV} style={{ ...btnSecondary, flex: 1, minWidth: 160, background: "#059669", borderColor: "#059669", color: "#fff" }}>
                    📊 Export CSV
                  </button>
                </div>

                {/* Explanation */}
                {showExplain && (
                  <div style={{ background: "#f8fafc", borderRadius: 14, padding: "20px 24px", border: "1px solid #e2e8f0", marginBottom: 20 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>📝 Calculation Explained (Plain English)</h3>
                    <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.7, color: "#334155", whiteSpace: "pre-wrap", margin: 0 }}>
                      {explanation}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 10 }}>
              <button onClick={() => setActiveTab("policy")} style={{ ...btnSecondary, background: "transparent", border: "1.5px solid #d1d5db", color: "#475569" }}>← Policy Settings</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, padding: "16px 0", borderTop: "1px solid #e2e8f0", color: "#94a3b8", fontSize: 11, fontWeight: 500 }}>
          PayCalc Pro — Attendance-Based Salary Calculator • Every number is traceable
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───
const StatCard = ({ label, value, accent, warning, highlight }) => (
  <div style={{
    background: highlight ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "14px 16px",
    border: highlight ? "none" : "1px solid rgba(255,255,255,0.1)",
    boxShadow: highlight ? "0 4px 16px rgba(37,99,235,0.3)" : "none",
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: highlight ? "rgba(255,255,255,0.7)" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
    <div style={{
      fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
      color: highlight ? "#fff" : warning ? "#f59e0b" : accent ? "#34d399" : "#e2e8f0",
    }}>{value}</div>
  </div>
);

const BreakdownRow = ({ label, count, sub, color }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
    <span style={{ fontSize: 13, fontWeight: 500, color: "#475569" }}>{label}</span>
    <div style={{ textAlign: "right" }}>
      <Badge color={color}>{count}</Badge>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

// ─── Styles ───
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, letterSpacing: "0.02em" };
const cardStyle = { padding: "16px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" };
const btnSecondary = {
  padding: "10px 22px", borderRadius: 10, border: "1.5px solid #2563eb", background: "#2563eb", color: "#fff",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
};
