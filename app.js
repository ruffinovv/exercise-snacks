const STORAGE_KEY = "exercise-snacks-state-v1";
const PLAN_SCHEMA_VERSION = 3;
const DEFAULT_START_DATE = "2026-05-11";
const PLAN_DAYS = 90;

const user = {
  bodyWeightKg: 95,
  heightCm: 180,
  maxPullups: 10,
  maxDips: 12,
  maxPushups: 15,
  maxHandstandPushups: 5,
};

const baseWeights = {
  lightFly: 5,
  rearFly: 7.5,
  triceps: 7.5,
  curl: 10,
  curlHeavy: 12.5,
  press: 10,
  row: 16,
  lawnmower: 20,
  squatPress: 8,
  throwBomb: 7.5,
  crossBody: 5,
};

const $ = (selector) => document.querySelector(selector);

let state;
let deferredInstallPrompt = null;
let notificationTimers = [];
let chimeContext = null;
const START_STEP_MINUTES = 5;
const INTERVAL_OPTIONS = Array.from({ length: 12 }, (_, index) => (index + 1) * 5);
const PER_BREAK_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeState(JSON.parse(saved));
  const today = localDateStamp();
  return normalizeState({
    config: {
      startTime: suggestedStartTime(new Date(), 30),
      intervalMinutes: 30,
      perBreak: 2,
      notificationsEnabled: false,
      nightMode: false,
      startSuggestedDate: today,
      manualStartDate: "",
      schedulePrepared: false,
      planStartDate: DEFAULT_START_DATE,
      workoutOverrides: {},
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      profile: { ...user },
    },
    plan: generatePlan(DEFAULT_START_DATE),
    createdAt: new Date().toISOString(),
  });
}

function normalizeState(loaded) {
  const config = {
    startTime: suggestedStartTime(new Date(), 30),
    intervalMinutes: 30,
    perBreak: 2,
    notificationsEnabled: false,
    nightMode: false,
    startSuggestedDate: localDateStamp(),
    manualStartDate: "",
    schedulePrepared: false,
    planStartDate: DEFAULT_START_DATE,
    workoutOverrides: {},
    planSchemaVersion: 0,
    profile: { ...user },
    ...(loaded?.config || {}),
  };
  config.profile = normalizeProfile(config.profile);
  config.workoutOverrides = Object.fromEntries(
    Object.entries(config.workoutOverrides || {}).filter(([, workout]) => workoutChoices.includes(workout)),
  );
  const firstTrainingDay = Array.isArray(loaded?.plan)
    ? loaded.plan.find((day) => day.trainingDay === 1)
    : null;
  const hasStaleWorkoutOrder = firstTrainingDay?.workout !== "Chest & Back + Ab Ripper X";
  const shouldRebuildPlan = !Array.isArray(loaded?.plan) || config.planSchemaVersion !== PLAN_SCHEMA_VERSION || hasStaleWorkoutOrder;
  const plan = shouldRebuildPlan
    ? generatePlan(config.planStartDate, config.workoutOverrides)
    : loaded.plan;
  config.planSchemaVersion = PLAN_SCHEMA_VERSION;
  return {
    config,
    plan,
    createdAt: loaded?.createdAt || new Date().toISOString(),
  };
}

function normalizeProfile(profile = {}) {
  return {
    bodyWeightKg: positiveNumber(profile.bodyWeightKg, user.bodyWeightKg),
    heightCm: positiveNumber(profile.heightCm, user.heightCm),
    maxPullups: wholeNumber(profile.maxPullups, user.maxPullups),
    maxDips: wholeNumber(profile.maxDips, user.maxDips),
    maxPushups: wholeNumber(profile.maxPushups ?? profile.maxFingerPushups, user.maxPushups),
    maxHandstandPushups: wholeNumber(profile.maxHandstandPushups, user.maxHandstandPushups),
  };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function wholeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function profileValue(key) {
  return state?.config?.profile?.[key] ?? user[key];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeParts(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`;
}

function formatClockTime(date = new Date()) {
  return formatTimeParts(date.getHours(), date.getMinutes());
}

function suggestedStartTime(date = new Date(), intervalMinutes = 30) {
  const interval = Math.max(START_STEP_MINUTES, Number(intervalMinutes) || 30);
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const roundedMinutes = Math.ceil(minutesNow / interval) * interval;
  const hour = Math.floor(roundedMinutes / 60) % 24;
  const minute = roundedMinutes % 60;
  return formatTimeParts(hour, minute);
}

function startTimeOptions() {
  const options = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += START_STEP_MINUTES) {
    options.push(formatTimeParts(Math.floor(minutes / 60), minutes % 60));
  }
  return options;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addWeekdays(date, days) {
  const d = new Date(`${date}T00:00:00`);
  const direction = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + direction);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayName(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function strengthTarget(kind, setNo, exposure) {
  const secondSetDrop = setNo === 2 ? 1 : 0;
  const values = {
    pullup: Math.min(16, 7 + Math.floor(exposure / 2)),
    chinup: Math.min(16, 7 + Math.floor(exposure / 2)),
    pushupStd: Math.min(32, 12 + exposure),
    pushupHard: Math.min(22, 8 + Math.floor(exposure / 2)),
    pushupPike: Math.min(8, 4 + Math.floor(exposure / 3)),
    dip: Math.min(20, 8 + Math.floor(exposure / 2)),
    weight12: 10 + (exposure % 3),
    weight10: 8 + (exposure % 3),
    abs25: Math.min(40, 25 + Math.floor(exposure / 2)),
  };
  return Math.max(1, (values[kind] ?? 12) - secondSetDrop);
}

function weightTarget(base, exposure, kind = "normal") {
  if (!base) return "";
  const increment = kind === "small" ? 0.5 : kind === "large" ? 2 : 1;
  return roundHalf(base + Math.floor(exposure / 3) * increment);
}

function repMove(exercise, targetKind, weight = "", equipment = "") {
  return { exercise, targetKind, weight, equipment, trackingType: "Reps" };
}

function fixedMove(exercise, target, trackingType = "Reps", weight = "", equipment = "") {
  return { exercise, target, trackingType, weight, equipment };
}

function repeat(moves, times) {
  const out = [];
  for (let set = 1; set <= times; set += 1) {
    moves.forEach((move, index) => out.push({ ...move, section: times > 1 ? `Set ${set}` : (move.section || "Main"), set, baseOrder: index + 1 }));
  }
  return out;
}

const workoutDefs = {
  "Chest & Back": repeat([
    repMove("Standard Push-Ups", "pushupStd"),
    repMove("Wide Front Pull-Ups", "pullup"),
    repMove("Military Push-Ups", "pushupHard"),
    repMove("Reverse Grip Chin-Ups", "chinup"),
    repMove("Wide Fly Push-Ups", "pushupStd"),
    repMove("Closed Grip Overhand Pull-Ups", "pullup"),
    repMove("Decline Push-Ups", "pushupHard"),
    repMove("Heavy Pants", "weight12", baseWeights.row),
    repMove("Diamond Push-Ups", "pushupHard"),
    repMove("Lawnmowers", "weight12", baseWeights.lawnmower),
    repMove("Dive-Bomber Push-Ups", "pushupHard"),
    repMove("Back Flys", "weight12", baseWeights.rearFly),
  ], 2),
  "Plyometrics": [
    ...repeat([
      fixedMove("Jump Squat", 15),
      fixedMove("Run-Stance Squat", 24),
      fixedMove("Airborne Heisman", 20),
      fixedMove("Swing Kick", 50),
      fixedMove("Squat Reach Jump", 14),
      fixedMove("Run-Stance Squat Switch Pick-Up", 20),
      fixedMove("Double Airborne Heisman", 16),
      fixedMove("Circle Run", 80),
      fixedMove("Jump Knee Tuck", 12),
      fixedMove("Mary Katherine Lunges", 20),
      fixedMove("Leapfrog Squats", 12),
      fixedMove("Twist Combo", 50),
      fixedMove("Rock Star Hop", 12),
      fixedMove("Gap Jump", 12),
      fixedMove("Squat Jack", 18),
      fixedMove("Military March", 50),
      fixedMove("Run Squat 180 Jump Switch", 12),
      fixedMove("Lateral Leapfrog Squat", 16),
      fixedMove("Monster Truck Tires", 24),
      fixedMove("Hot Foot", 40),
    ], 2).map((move) => ({ ...move, section: move.section.replace("Set", "Round") })),
    { ...fixedMove("Pitch and Catch", 30), section: "Bonus", set: 1 },
    { ...fixedMove("Jump Shot", 25), section: "Bonus", set: 1 },
    { ...fixedMove("Football Hero", 24), section: "Bonus", set: 1 },
  ],
  "Shoulders & Arms": repeat([
    repMove("Alternating Shoulder Presses", "weight12", baseWeights.press),
    repMove("In & Out Bicep Curls", "weight12", baseWeights.curl),
    repMove("Two-Arm Tricep Kickbacks", "weight12", baseWeights.triceps),
    repMove("Deep Swimmer's Presses", "weight12", baseWeights.press),
    repMove("Full Supination Concentration Curls", "weight12", baseWeights.curl),
    repMove("Chair Dips", "dip"),
    repMove("Upright Rows", "weight12", baseWeights.curlHeavy),
    repMove("Static Arm Curls", "weight12", baseWeights.curl),
    repMove("Flip-Grip Twist Tricep Kickbacks", "weight12", baseWeights.triceps),
    repMove("Two-Angle Shoulder Flys", "weight10", baseWeights.lightFly),
    repMove("Crouching Cohen Curls", "weight12", baseWeights.curl),
    repMove("Lying-Down Tricep Extensions", "weight12", baseWeights.triceps),
    repMove("In & Out Straight-Arm Shoulder Flys", "weight10", baseWeights.lightFly),
    repMove("Congdon Curls", "weight12", baseWeights.curlHeavy),
    repMove("Side Tri-Rises", "dip"),
  ], 1),
  "Legs & Back": repeat([
    repMove("Balance Lunges", "weight12"),
    repMove("Calf-Raise Squats", "weight12"),
    repMove("Reverse Grip Chin-Ups", "chinup"),
    fixedMove("Super Skaters", 20),
    fixedMove("Wall Squats", 60, "Seconds"),
    repMove("Wide Front Pull-Ups", "pullup"),
    repMove("Step-Back Lunges", "weight12"),
    repMove("Alternating Side Lunges", "weight12"),
    repMove("Closed Grip Overhand Pull-Ups", "pullup"),
    fixedMove("Single-Leg Wall Squats", 60, "Seconds"),
    repMove("Deadlift Squats", "weight12"),
    repMove("Switch Grip Pull-Ups", "pullup"),
    repMove("Three-Way Lunges", "weight12"),
    fixedMove("Sneaky Lunges", 60, "Seconds"),
    repMove("Toe-Roll Iso Lunges", "weight12"),
    fixedMove("Groucho Walk", 60, "Seconds"),
    fixedMove("Calf Raises", 25),
    fixedMove("80-20 Siebers Speed Squats", 20),
  ], 1),
  "Kenpo X": [
    ["Twist and Pivot", 40], ["Twist and Pivot with Hook and Uppercut", 40], ["Jabs", 80], ["Jab-Cross", 80],
    ["Jab-Cross-Hook", 60], ["Jab-Cross-Hook-Uppercut", 60], ["Step Drag High-Low Punch", 40], ["Jab-Cross Switch", 40],
    ["Hook-Uppercut Switch", 40], ["Knee Kick", 30], ["Ball Kick", 30], ["Side Kick", 24], ["Back Kick", 24],
    ["Three-Direction Kick", 18], ["Side Lunge with High Sword-Low Hammer", 24], ["Step Drag-Claw-Low Punch", 30],
    ["High Block", 50], ["Inward Block", 50], ["Outward Block", 50], ["Downward Block", 50], ["Star Block", 20],
    ["Front Shuffle with High Block-Low Punch", 30], ["Knee-Back Kick", 24], ["Front and Back Knuckles-Ball Kick-Back Kick", 20],
    ["Hook-Uppercut-Low Side Kick", 24], ["Elbow Series", 40], ["Vertical Punches", 80],
  ].map(([exercise, target]) => ({ ...fixedMove(exercise, target), section: "Main", set: 1 })),
  "Core Synergistics": [
    repMove("Stacked-Foot Staggered-Hands Push-Ups", "pushupHard"),
    fixedMove("Banana Rolls", 60, "Seconds"),
    repMove("Leaning Crescent Lunges", "weight12", baseWeights.lightFly),
    fixedMove("Squat Runs", 50),
    repMove("Sphinx Push-Ups", "pushupHard"),
    fixedMove("Bow to Boat", 60, "Seconds"),
    fixedMove("Low Lateral Skaters", 30),
    repMove("Lunge and Reach", "weight12", baseWeights.lightFly),
    repMove("Prison Cell Push-Ups", "pushupHard"),
    repMove("Side Hip Raises", "weight12"),
    repMove("Squat X Presses", "weight12", baseWeights.squatPress),
    fixedMove("Plank to Chaturanga Runs", 40),
    repMove("Walking Push-Ups", "pushupHard"),
    fixedMove("Superman Bananas", 60, "Seconds"),
    repMove("Lunge Kickbacks", "weight12", baseWeights.triceps),
    repMove("Curl Presses", "weight12", baseWeights.curl),
    fixedMove("Towel Hoppers", 50),
    repMove("Reach High and Under Push-Ups", "pushupHard"),
    fixedMove("Steam Engines", 50),
    repMove("Dreya Rolls", "weight10"),
    fixedMove("Plank to Chaturangas", 60, "Seconds"),
    fixedMove("Halfbacks", 40),
    repMove("Table-Dip Leg Raises", "dip"),
  ].map((move, index) => ({ ...move, section: index < 8 ? "Round 1" : index < 17 ? "Round 2" : index < 20 ? "Round 3" : "Bonus", set: 1 })),
  "Chest Shoulders & Triceps": repeat([
    repMove("Slow-Motion 3-in-1 Push-Ups", "pushupHard"),
    repMove("In & Out Shoulder Flys", "weight10", baseWeights.lightFly),
    repMove("Chair Dips", "dip"),
    repMove("Plange Push-Ups", "pushupHard"),
    repMove("Pike Presses", "pushupPike"),
    repMove("Side Tri-Rises", "dip"),
    repMove("Floor Flys", "pushupHard"),
    repMove("Scarecrows", "weight12", baseWeights.lightFly),
    repMove("Overhead Tricep Extensions", "weight12", baseWeights.triceps),
    repMove("Two-Twitch Speed Push-Ups", "pushupHard"),
    repMove("Y-Presses", "weight12", baseWeights.press),
    repMove("Lying Tricep Extensions", "weight12", baseWeights.triceps),
    repMove("Side-to-Side Push-Ups", "pushupHard"),
    repMove("Pour Flys", "weight10", baseWeights.lightFly),
    repMove("Side-Leaning Tricep Extensions", "weight12", baseWeights.triceps),
    repMove("One-Arm Push-Ups", "pushupPike"),
    fixedMove("Weighted Circles", 40, "Reps", baseWeights.lightFly),
    repMove("Throw the Bomb", "weight12", baseWeights.throwBomb),
    repMove("Clap or Plyo Push-Ups", "pushupHard"),
    repMove("Slo-Mo Throws", "weight12", baseWeights.throwBomb),
    repMove("Front-to-Back Tricep Extensions", "weight12", baseWeights.triceps),
    repMove("One-Arm Balance Push-Ups", "pushupHard"),
    repMove("Fly-Row Presses", "weight12", baseWeights.row),
    repMove("Dumbbell Cross-Body Blows", "weight12", baseWeights.crossBody),
  ], 1),
  "Back & Biceps": repeat([
    repMove("Wide Front Pull-Ups", "pullup"),
    repMove("Lawnmowers", "weight12", baseWeights.lawnmower),
    fixedMove("Twenty-Ones", 21, "Reps", baseWeights.curl),
    repMove("One-Arm Cross-Body Curls", "weight12", baseWeights.curl),
    repMove("Switch Grip Pull-Ups", "pullup"),
    repMove("Elbows-Out Lawnmowers", "weight12", baseWeights.row),
    repMove("Standing Bicep Curls", "weight12", baseWeights.curlHeavy),
    repMove("One-Arm Concentration Curls", "weight12", baseWeights.curl),
    repMove("Corn Cob Pull-Ups", "pullup"),
    repMove("Reverse Grip Bent-Over Rows", "weight12", baseWeights.row),
    repMove("Open Arm Curls", "weight12", baseWeights.curl),
    repMove("Static Arm Curls", "weight12", baseWeights.curl),
    repMove("Towel Pull-Ups", "pullup"),
    repMove("Congdon Locomotives", "weight12", baseWeights.row),
    repMove("Crouching Cohen Curls", "weight12", baseWeights.curl),
    repMove("One-Arm Corkscrew Curls", "weight12", baseWeights.curl),
    repMove("Chin-Ups", "chinup"),
    repMove("Seated Bent-Over Back Flys", "weight12", baseWeights.rearFly),
    repMove("Curl-Up/Hammer Downs", "weight12", baseWeights.curl),
    repMove("Hammer Curls", "weight12", baseWeights.curlHeavy),
    repMove("Max Rep Pull-Ups", "pullup"),
    fixedMove("Superman", 60, "Seconds"),
    repMove("In-Out Hammer Curls", "weight12", baseWeights.curl),
    repMove("Strip-Set Curls", "weight10", baseWeights.curl),
  ], 1),
  "Ab Ripper X": [
    ["In and Outs", 25], ["Seated Bicycle Forward", 25], ["Seated Bicycle Reverse", 25], ["Crunchy Frog", 25],
    ["Wide-Leg Sit-Up", 25], ["Fifer Scissors", 25], ["Hip Rock N Raise", 25], ["Pulse-Up", 25],
    ["Roll-Up / V-Up Combo", 24], ["Oblique V-Up Right", 25], ["Oblique V-Up Left", 25],
    ["Leg Climb Right", 12], ["Leg Climb Left", 12], ["Mason Twist", 50],
  ].map(([exercise, target]) => ({ ...fixedMove(exercise, target), section: "Main", set: 1 })),
  "X Stretch": [
    "Neck Stretch", "Shoulder and Triceps Stretch", "Wrist and Forearm Stretch", "Back and Chest Stretch",
    "Hamstring Stretch", "Runner's Stretch", "Seated Spinal Stretch", "Glute Stretch", "Frog Stretch", "Cobra to Downward Dog",
  ].map((exercise) => ({ ...fixedMove(exercise, 60, "Seconds"), section: "Main", set: 1 })),
};

const trainingSequence = [
  ...cycle(["Chest & Back + Ab Ripper X", "Plyometrics", "Shoulders & Arms + Ab Ripper X", "Legs & Back + Ab Ripper X", "Kenpo X"], 3),
  "Core Synergistics", "X Stretch", "Kenpo X", "Core Synergistics", "X Stretch",
  ...cycle(["Chest Shoulders & Triceps + Ab Ripper X", "Plyometrics", "Back & Biceps + Ab Ripper X", "Legs & Back + Ab Ripper X", "Kenpo X"], 3),
  "Core Synergistics", "X Stretch", "Kenpo X", "Core Synergistics", "X Stretch",
  ...cycle(["Chest & Back + Ab Ripper X", "Plyometrics", "Shoulders & Arms + Ab Ripper X", "Legs & Back + Ab Ripper X", "Kenpo X"], 2),
  ...cycle(["Chest Shoulders & Triceps + Ab Ripper X", "Plyometrics", "Back & Biceps + Ab Ripper X", "Legs & Back + Ab Ripper X", "Kenpo X"], 2),
  "Core Synergistics", "X Stretch", "Kenpo X", "Core Synergistics",
];

const workoutChoices = [...new Set(trainingSequence)].filter((workout) => workout && workout !== "Rest");

function cycle(items, times) {
  return Array.from({ length: times }, () => items).flat();
}

function generatePlan(startDate = DEFAULT_START_DATE, workoutOverrides = {}) {
  const plan = [];
  const exposureState = createExposureState();
  let trainingIndex = 0;

  for (let calendarDay = 1; calendarDay <= PLAN_DAYS; calendarDay += 1) {
    const date = addDays(startDate, calendarDay - 1);
    const day = new Date(`${date}T00:00:00`).getDay();
    const isWeekend = day === 0 || day === 6;
    const week = Math.floor((calendarDay - 1) / 7) + 1;
    const trainingDay = isWeekend ? null : trainingIndex + 1;
    const phase = isWeekend ? "Rest" :
      trainingIndex < 15 ? "Phase 1" :
      trainingIndex < 20 ? "Recovery 1" :
      trainingIndex < 35 ? "Phase 2" :
      trainingIndex < 40 ? "Recovery 2" :
      trainingIndex < 60 ? "Phase 3" : "Final Recovery";
    const workout = isWeekend ? "Rest" : workoutOverrides[trainingDay] || trainingSequence[trainingIndex] || "Rest";
    const dayPlan = {
      calendarDay,
      trainingDay,
      date,
      weekday: dayName(date),
      week,
      phase,
      workout,
      isRest: isWeekend || workout === "Rest",
      entries: [],
    };

    if (!dayPlan.isRest) {
      dayPlan.entries = buildWorkoutEntries(dayPlan, workout, exposureState);
      trainingIndex += 1;
    }
    plan.push(dayPlan);
  }
  return plan;
}

function createExposureState() {
  return { exerciseExposure: {}, occurrenceExposure: {} };
}

function exposureBeforeTrainingDay(trainingDay) {
  const exposureState = createExposureState();
  state.plan
    .filter((day) => !day.isRest && day.trainingDay < trainingDay)
    .flatMap((day) => day.entries)
    .forEach((entry) => {
      exposureState.exerciseExposure[entry.exercise] = (exposureState.exerciseExposure[entry.exercise] || 0) + 1;
    });
  return exposureState;
}

function buildWorkoutEntries(dayPlan, workout, exposureState) {
  const entries = [];
  if (!workout || workout === "Rest") return entries;
  workout.split(" + ").forEach((part) => {
    const moves = workoutDefs[part] || [];
    moves.forEach((move, index) => {
      const occurrenceKey = `${dayPlan.date}|${part}|${move.baseOrder || index + 1}|${move.exercise}`;
      let exposure = exposureState.occurrenceExposure[occurrenceKey];
      if (exposure === undefined) {
        exposure = exposureState.exerciseExposure[move.exercise] || 0;
        exposureState.occurrenceExposure[occurrenceKey] = exposure;
        exposureState.exerciseExposure[move.exercise] = exposure + 1;
      }
      const setNo = move.set || 1;
      const targetReps = move.targetKind ? strengthTarget(move.targetKind, setNo, exposure) : move.target;
      const baseWeight = Number(move.weight);
      const weightKind = baseWeight <= 8 ? "small" : baseWeight >= 16 ? "large" : "normal";
      const targetWeight = baseWeight ? weightTarget(baseWeight, exposure, weightKind) : "";
      entries.push({
        id: `${dayPlan.date}-${entries.length + 1}-${slug(move.exercise)}`,
        date: dayPlan.date,
        calendarDay: dayPlan.calendarDay,
        trainingDay: dayPlan.trainingDay,
        week: dayPlan.week,
        phase: dayPlan.phase,
        workout: part,
        section: move.section || "Main",
        set: setNo,
        exerciseOrder: index + 1,
        exercise: move.exercise,
        trackingType: move.trackingType || "Reps",
        targetReps,
        actualReps: "",
        targetWeight,
        actualWeight: "",
        caloriesBurned: 0,
        calorieEstimate: null,
        status: "Planned",
        completedAt: "",
        notes: "",
      });
    });
  });
  return entries;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getNextDay() {
  return state.plan.find((day) => !day.isRest && day.entries.some((entry) => entry.status === "Planned")) || null;
}

function getDayStatus(day) {
  if (day.isRest) return "Rest";
  const done = day.entries.filter((entry) => entry.status === "Done").length;
  const skipped = day.entries.filter((entry) => entry.status === "Skipped").length;
  if (done + skipped === day.entries.length) return "Complete";
  if (done || skipped) return "In progress";
  return "Planned";
}

function normalizeTime(value, fallback = "09:00") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return formatTimeParts(hour, minute);
}

function parseTime(value, fallback = "09:00") {
  const normalized = normalizeTime(value, fallback);
  const [h, m] = normalized.split(":").map(Number);
  return { h, m };
}

function addMinutesToTime(start, minutes, options = {}) {
  const date = new Date(2000, 0, 1, start.h, start.m + minutes, 0, 0);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (!options.showDayOffset) return time;
  const dayOffset = Math.floor((start.h * 60 + start.m + minutes) / 1440);
  if (dayOffset === 1) return `${time} next day`;
  if (dayOffset > 1) return `${time} +${dayOffset} days`;
  return time;
}

function slotForIndex(index) {
  return Math.floor(index / state.config.perBreak) + 1;
}

function plannedTimeForIndex(index) {
  const slot = slotForIndex(index);
  return addMinutesToTime(parseTime(state.config.startTime), (slot - 1) * state.config.intervalMinutes, {
    showDayOffset: true,
  });
}

function populateScheduleControls() {
  const start = $("#startTime");
  const interval = $("#intervalMinutes");
  const perBreak = $("#perBreak");
  start.innerHTML = startTimeOptions().map((time) => `<option value="${time}">${time}</option>`).join("");
  interval.innerHTML = INTERVAL_OPTIONS
    .map((minutes) => `<option value="${minutes}">${minutes} min</option>`)
    .join("");
  perBreak.innerHTML = PER_BREAK_OPTIONS
    .map((count) => `<option value="${count}">${count} exercise${count === 1 ? "" : "s"}</option>`)
    .join("");
}

function syncConfigFromControls() {
  const intervalMinutes = Number($("#intervalMinutes").value || 30);
  const fallbackStart = suggestedStartTime(new Date(), intervalMinutes);
  const startTime = normalizeTime($("#startTime").value, fallbackStart);
  $("#startTime").value = startTime;
  state.config = {
    ...state.config,
    startTime,
    intervalMinutes,
    perBreak: Number($("#perBreak").value || 2),
    notificationsEnabled: $("#notificationsEnabled").checked,
    nightMode: $("#nightMode")?.checked ?? Boolean(state.config?.nightMode),
    manualStartDate: localDateStamp(),
    schedulePrepared: true,
  };
  saveState();
}

function applyConfigToControls() {
  const today = localDateStamp();
  const intervalMinutes = Number(state.config?.intervalMinutes || 30);
  const suggested = suggestedStartTime(new Date(), intervalMinutes);
  const shouldUseSuggestion = state.config?.startSuggestedDate !== today && state.config?.manualStartDate !== today;
  state.config = {
    ...state.config,
    startTime: shouldUseSuggestion ? suggested : normalizeTime(state.config?.startTime, suggested),
    intervalMinutes,
    perBreak: Number(state.config?.perBreak || 2),
    notificationsEnabled: Boolean(state.config?.notificationsEnabled),
    nightMode: Boolean(state.config?.nightMode),
    startSuggestedDate: shouldUseSuggestion ? today : state.config?.startSuggestedDate || today,
    manualStartDate: state.config?.manualStartDate || "",
    schedulePrepared: Boolean(state.config?.schedulePrepared),
  };
  if (!startTimeOptions().includes(state.config.startTime)) {
    state.config.startTime = suggested;
  }
  $("#startTime").value = state.config.startTime;
  $("#intervalMinutes").value = String(state.config.intervalMinutes);
  $("#perBreak").value = String(state.config.perBreak);
  $("#notificationsEnabled").checked = state.config.notificationsEnabled;
  const nightMode = $("#nightMode");
  if (nightMode) nightMode.checked = state.config.nightMode;
  applyTheme();
  saveState();
  refreshClockSuggestion();
}

function applyTheme() {
  const nightMode = Boolean(state?.config?.nightMode);
  document.documentElement.dataset.theme = nightMode ? "night" : "day";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nightMode ? "#0f1715" : "#16625b");
}

function refreshClockSuggestion(options = {}) {
  const interval = Number($("#intervalMinutes")?.value || state.config?.intervalMinutes || 30);
  const now = new Date();
  const suggested = suggestedStartTime(now, interval);
  const start = $("#startTime");
  if (start) {
    Array.from(start.options).forEach((option) => {
      option.textContent = option.value === suggested ? `${option.value} (suggested)` : option.value;
    });
    if (options.apply) {
      start.value = suggested;
    }
  }
  const hint = $("#clockHint");
  if (hint) {
    hint.textContent = `Today ${localDateStamp(now)} - Now ${formatClockTime(now)} - Suggested start ${suggested}`;
  }
  return suggested;
}

function render() {
  renderToday();
  renderPlan();
  renderProgress();
  renderSettings();
}

function renderToday() {
  const day = getNextDay();
  const view = $("#todayView");
  if (!day) {
    view.innerHTML = `<section class="panel empty">All exercise snacks in this plan are complete.</section>`;
    clearNotificationTimers();
    return;
  }

  const plannedEntries = day.entries.filter((entry) => entry.status === "Planned");
  const plannedWithIndex = day.entries
    .map((entry, index) => ({ entry, index }))
    .filter((item) => item.entry.status === "Planned");
  const completed = day.entries.filter((entry) => entry.status === "Done").length;
  const skipped = day.entries.filter((entry) => entry.status === "Skipped").length;
  const calories = day.entries.reduce((sum, entry) => sum + Number(entry.caloriesBurned || 0), 0);
  const sessionInfo = getSessionInfo(day, plannedWithIndex);
  const nextSlot = plannedWithIndex.length ? slotForIndex(plannedWithIndex[0].index) : null;
  const nextTime = plannedWithIndex.length ? plannedTimeForIndex(plannedWithIndex[0].index) : "";
  const nextEntries = plannedWithIndex
    .filter((item) => slotForIndex(item.index) === nextSlot)
    .map((item) => item.entry);

  let html = `
    <section class="panel summary">
      ${stat("Workout", day.workout)}
      ${stat("Day", day.trainingDay)}
      ${stat("Done", `${completed}/${day.entries.length}`)}
    </section>
    <section class="panel session-info">
      ${stat("Remaining breaks", sessionInfo.remainingBreaks)}
      ${stat("Next break", sessionInfo.nextBreak)}
      ${stat("Session ends", sessionInfo.end)}
      ${stat("Est. kcal", calories)}
    </section>
    <section class="panel">
      <div class="actions">
        <button data-action="reset-today" data-day="${day.trainingDay}">Reset today</button>
        <button class="secondary" data-action="skip-day" data-day="${day.trainingDay}">Skip this day</button>
      </div>
    </section>
  `;

  if (nextEntries.length) {
    html += `<article class="snack-card"><div class="slot-header"><span>Break ${nextSlot}</span><span class="slot-time">${nextTime}</span></div>`;
    nextEntries.forEach((entry) => {
      html += exerciseRow(entry);
    });
    html += `</article>`;
  }

  if (!plannedEntries.length) {
    html += `<section class="panel empty">This day is complete. The next workout will appear automatically.</section>`;
  }
  view.innerHTML = html;
  scheduleNotifications();
}

function getSessionInfo(day, plannedWithIndex) {
  const total = day.entries.length;
  const totalBreaks = Math.max(1, Math.ceil(total / state.config.perBreak));
  const remainingBreaks = new Set(plannedWithIndex.map((item) => slotForIndex(item.index))).size;
  const nextBreak = plannedWithIndex.length ? plannedTimeForIndex(plannedWithIndex[0].index) : "Complete";
  const start = parseTime(state.config.startTime);
  const end = state.config.schedulePrepared
    ? addMinutesToTime(start, totalBreaks * state.config.intervalMinutes, { showDayOffset: true })
    : "Press Prepare";
  return { remainingBreaks, nextBreak, end };
}

function stat(label, value) {
  return `<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`;
}

function metForExercise(entry) {
  const workout = String(entry.workout || "").toLowerCase();
  const exercise = String(entry.exercise || "").toLowerCase();
  if (workout.includes("stretch") || exercise.includes("stretch")) return 2.3;
  if (workout.includes("plyometrics") || exercise.includes("jump") || exercise.includes("hop") || exercise.includes("leap")) return 8;
  if (workout.includes("kenpo") || exercise.includes("kick") || exercise.includes("punch") || exercise.includes("block")) return 7;
  if (exercise.includes("pull-up") || exercise.includes("chin-up") || exercise.includes("push-up") || exercise.includes("dip")) return 6;
  if (exercise.includes("ab") || exercise.includes("crunch") || exercise.includes("sit-up") || exercise.includes("plank") || exercise.includes("banana")) return 4.5;
  if (entry.targetWeight) return 4.8;
  return 4;
}

function estimatedMinutesForEntry(entry) {
  if (entry.trackingType === "Seconds") return Math.max(0.25, Number(entry.actualReps || entry.targetReps || 30) / 60);
  const reps = Number(entry.actualReps || entry.targetReps || 10);
  return Math.max(0.25, (reps * 2.5) / 60);
}

function estimateCalories(entry) {
  const met = metForExercise(entry);
  const minutes = estimatedMinutesForEntry(entry);
  const bodyWeightKg = profileValue("bodyWeightKg");
  return Math.max(0, Math.round((minutes * met * 3.5 * bodyWeightKg) / 200));
}

function exerciseRow(entry) {
  const weight = entry.targetWeight ? `${entry.targetWeight} kg` : "";
  const unit = entry.trackingType === "Seconds" ? "sec" : "reps";
  return `
    <div class="exercise-row" data-id="${entry.id}">
      <div>
        <div class="exercise-name">${escapeHtml(entry.exercise)}</div>
        <div class="exercise-meta">${escapeHtml(entry.workout)} - ${escapeHtml(entry.section)} - set ${entry.set}</div>
      </div>
      <div>
        <div class="tiny">Target</div>
        <div class="target">${escapeHtml(entry.targetReps)} ${unit}</div>
      </div>
      <div>
        <div class="tiny">Weight</div>
        <div class="target">${escapeHtml(weight)}</div>
      </div>
      <div class="actions">
        <button class="primary" data-action="done" data-id="${entry.id}">Done</button>
        <button data-action="actual" data-id="${entry.id}">Actual</button>
        <button class="danger" data-action="skip" data-id="${entry.id}">Skip</button>
      </div>
    </div>
  `;
}

function renderPlan() {
  const nextDay = getNextDay();
  const trainingDays = state.plan.filter((day) => !day.isRest);
  const selectedDay = nextDay || trainingDays[0];
  const selectedTrainingDay = selectedDay?.trainingDay || 1;
  const currentCalendarDay = nextDay?.calendarDay ?? Number.POSITIVE_INFINITY;
  const planWorkoutChoices = [...new Set(trainingDays.map((day) => day.workout))];
  $("#planView").innerHTML = `
    <section class="panel">
      <h2>90-day plan</h2>
      <p class="tiny">Pick any day, choose its workout, or make that day today's session.</p>
    </section>
    <section class="panel plan-tools">
      <div>
        <h2>Adjust plan</h2>
        <p class="tiny">Making a day current re-dates the plan around today and marks earlier days complete.</p>
      </div>
      <label>
        Day
        <select id="planDaySelect">
          ${trainingDays.map((day) => `
            <option value="${day.trainingDay}" ${day.trainingDay === selectedTrainingDay ? "selected" : ""}>
              Day ${day.trainingDay}
            </option>
          `).join("")}
        </select>
      </label>
      <label>
        Workout
        <select id="planWorkoutSelect">
          ${planWorkoutChoices.map((workout) => `
            <option value="${escapeHtml(workout)}" ${workout === selectedDay?.workout ? "selected" : ""}>${escapeHtml(workout)}</option>
          `).join("")}
        </select>
      </label>
      <div class="actions plan-tool-actions">
        <button class="secondary" data-action="set-current-day">Make this today</button>
        <button data-action="change-day-workout">Change selected workout</button>
      </div>
    </section>
    <div class="plan-grid">
      ${state.plan.map((day) => {
        const status = getDayStatus(day);
        const isPastRestDay = day.isRest && day.calendarDay < currentCalendarDay;
        const isMarked = status === "Complete" || isPastRestDay;
        return `
          <article class="day-card ${isMarked ? "done" : ""}">
            <strong>${day.trainingDay ? `Day ${day.trainingDay}` : `Rest day ${day.calendarDay}`}</strong>
            <div>${day.date}</div>
            <div class="tiny">${escapeHtml(day.phase)} - Week ${day.week}</div>
            <div>${escapeHtml(day.workout)}</div>
            <div class="tiny">${status}</div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderProgress() {
  const allEntries = state.plan.flatMap((day) => day.entries);
  const done = allEntries.filter((entry) => entry.status === "Done");
  const skipped = allEntries.filter((entry) => entry.status === "Skipped");
  const totalCalories = done.reduce((sum, entry) => sum + Number(entry.caloriesBurned || 0), 0);
  const byExercise = new Map();
  done.forEach((entry) => {
    if (!byExercise.has(entry.exercise)) byExercise.set(entry.exercise, []);
    byExercise.get(entry.exercise).push(entry);
  });
  const improved = [...byExercise.values()].filter((items) => {
    const first = Number(items[0].actualReps || items[0].targetReps);
    const last = Number(items.at(-1).actualReps || items.at(-1).targetReps);
    return last > first;
  }).length;
  $("#progressView").innerHTML = `
    <section class="progress-grid">
      ${stat("Completed snacks", done.length)}
      ${stat("Est. calories", totalCalories)}
      ${stat("Skipped", skipped.length)}
      ${stat("Exercises improved", improved)}
    </section>
    <section class="panel">
      <h2>Recent completions</h2>
      ${done.slice(-12).reverse().map((entry) => `
        <div class="exercise-row status-done">
          <div>
            <div class="exercise-name">${escapeHtml(entry.exercise)}</div>
            <div class="exercise-meta">${entry.date} - ${escapeHtml(entry.workout)}</div>
          </div>
          <div><div class="tiny">Actual</div><div class="target">${escapeHtml(entry.actualReps || entry.targetReps)}</div></div>
          <div><div class="tiny">Weight</div><div class="target">${entry.actualWeight || entry.targetWeight || ""}</div></div>
          <div class="tiny">${entry.completedAt ? new Date(entry.completedAt).toLocaleString() : ""}</div>
        </div>
      `).join("") || `<div class="empty">No completions yet.</div>`}
    </section>
  `;
}

function renderSettings() {
  const notificationStatus = notificationSupportText();
  const profile = state.config.profile;
  $("#settingsView").innerHTML = `
    <section class="panel">
      <h2>Settings and data</h2>
      <p class="tiny">Exercise Snacks is local-first. Your data is stored in this browser unless you export it.</p>
    </section>
    <section class="settings-grid">
      <div class="stat-card">
        <h3>Profile baseline</h3>
        <div class="profile-grid">
          <label>
            Weight (kg)
            <input id="profileBodyWeightKg" type="number" min="1" step="0.1" value="${escapeHtml(profile.bodyWeightKg)}">
          </label>
          <label>
            Height (cm)
            <input id="profileHeightCm" type="number" min="1" step="1" value="${escapeHtml(profile.heightCm)}">
          </label>
          <label>
            Max pull-ups
            <input id="profileMaxPullups" type="number" min="0" step="1" value="${escapeHtml(profile.maxPullups)}">
          </label>
          <label>
            Max dips
            <input id="profileMaxDips" type="number" min="0" step="1" value="${escapeHtml(profile.maxDips)}">
          </label>
          <label>
            Max push-ups
            <input id="profileMaxPushups" type="number" min="0" step="1" value="${escapeHtml(profile.maxPushups)}">
          </label>
          <label>
            Max handstand push-ups
            <input id="profileMaxHandstandPushups" type="number" min="0" step="1" value="${escapeHtml(profile.maxHandstandPushups)}">
          </label>
        </div>
        <p class="tiny">Weight is used for estimated calorie burn.</p>
        <button data-action="save-profile">Save profile</button>
      </div>
      <div class="stat-card">
        <h3>Notifications</h3>
        <p class="tiny">${notificationStatus} Includes the in-app chime and visual break alert.</p>
        <button data-action="enable-notifications">Enable reminders</button>
      </div>
      <div class="stat-card">
        <h3>Appearance</h3>
        <label class="check-label">
          <input id="nightMode" type="checkbox" ${state.config.nightMode ? "checked" : ""}>
          Night mode
        </label>
      </div>
      <div class="stat-card">
        <h3>Export backup</h3>
        <p class="tiny">Download your local data as JSON.</p>
        <button data-action="export">Export</button>
      </div>
      <div class="stat-card">
        <h3>Reset prototype</h3>
        <p class="tiny">Clear local progress and rebuild the seeded plan.</p>
        <button class="danger" data-action="reset">Reset</button>
      </div>
    </section>
  `;
}

function findEntry(id) {
  for (const day of state.plan) {
    const entry = day.entries.find((item) => item.id === id);
    if (entry) return entry;
  }
  return null;
}

function markDone(id) {
  const entry = findEntry(id);
  if (!entry) return;
  const calories = estimateCalories(entry);
  entry.status = "Done";
  entry.actualReps = entry.targetReps;
  entry.actualWeight = entry.targetWeight;
  entry.caloriesBurned = calories;
  entry.calorieEstimate = {
    met: metForExercise(entry),
    minutes: estimatedMinutesForEntry(entry),
    bodyWeightKg: profileValue("bodyWeightKg"),
  };
  entry.completedAt = new Date().toISOString();
  saveState();
  toast(`Saved +${calories} kcal`);
  render();
}

function openActual(id) {
  const entry = findEntry(id);
  if (!entry) return;
  $("#dialogEntryId").value = id;
  $("#dialogTitle").textContent = entry.exercise;
  $("#actualReps").value = entry.actualReps || entry.targetReps || "";
  $("#actualWeight").value = entry.actualWeight || entry.targetWeight || "";
  $("#actualNote").value = entry.notes || "";
  $("#actualDialog").showModal();
}

function saveActual(event) {
  event.preventDefault();
  const entry = findEntry($("#dialogEntryId").value);
  if (!entry) return;
  entry.status = "Done";
  entry.actualReps = $("#actualReps").value || entry.targetReps;
  entry.actualWeight = $("#actualWeight").value || entry.targetWeight;
  const calories = estimateCalories(entry);
  entry.caloriesBurned = calories;
  entry.calorieEstimate = {
    met: metForExercise(entry),
    minutes: estimatedMinutesForEntry(entry),
    bodyWeightKg: profileValue("bodyWeightKg"),
  };
  entry.notes = $("#actualNote").value;
  entry.completedAt = new Date().toISOString();
  $("#actualDialog").close();
  saveState();
  toast(`Actual saved +${calories} kcal`);
  render();
}

function skipEntry(id) {
  const entry = findEntry(id);
  if (!entry) return;
  entry.status = "Skipped";
  entry.notes = "Skipped";
  entry.completedAt = new Date().toISOString();
  saveState();
  toast("Skipped");
  render();
}

function skipCurrentDay() {
  const day = getNextDay();
  if (!day) return;
  day.entries.forEach((entry) => {
    if (entry.status === "Planned") {
      entry.status = "Skipped";
      entry.notes = "Skipped day";
      entry.completedAt = new Date().toISOString();
    }
  });
  saveState();
  toast("Day skipped");
  render();
}

function resetToday() {
  const day = getNextDay();
  if (!day) return;
  if (!confirm("Reset today and clear all Done/Skipped entries for this day?")) return;
  day.entries.forEach((entry) => {
    entry.status = "Planned";
    entry.actualReps = "";
    entry.actualWeight = "";
    entry.completedAt = "";
    entry.notes = "";
  });
  saveState();
  toast("Today reset");
  render();
}

function resetEntryProgress(entry) {
  entry.status = "Planned";
  entry.actualReps = "";
  entry.actualWeight = "";
  entry.caloriesBurned = 0;
  entry.calorieEstimate = null;
  entry.completedAt = "";
  entry.notes = "";
}

function completeEntry(entry, completedAt) {
  entry.status = "Done";
  entry.actualReps = entry.targetReps;
  entry.actualWeight = entry.targetWeight;
  entry.caloriesBurned = estimateCalories(entry);
  entry.calorieEstimate = {
    met: metForExercise(entry),
    minutes: estimatedMinutesForEntry(entry),
    bodyWeightKg: profileValue("bodyWeightKg"),
  };
  entry.completedAt = completedAt;
  entry.notes = "Marked complete by plan adjustment";
}

function selectedPlanDay() {
  const trainingDay = Number($("#planDaySelect")?.value);
  return state.plan.find((day) => day.trainingDay === trainingDay) || null;
}

function planStartDateForTodayTrainingDay(trainingDay) {
  return addWeekdays(localDateStamp(), -(trainingDay - 1));
}

function setCurrentTrainingDay() {
  const day = selectedPlanDay();
  const workout = $("#planWorkoutSelect")?.value;
  if (!day) return;
  if (workout) state.config.workoutOverrides[day.trainingDay] = workout;
  const now = new Date().toISOString();
  state.config.planStartDate = planStartDateForTodayTrainingDay(day.trainingDay);
  state.plan = generatePlan(state.config.planStartDate, state.config.workoutOverrides);
  state.plan.forEach((item) => {
    if (item.isRest) return;
    if (item.trainingDay < day.trainingDay) {
      item.entries.forEach((entry) => completeEntry(entry, now));
      return;
    }
    if (item.trainingDay >= day.trainingDay) {
      item.entries.forEach(resetEntryProgress);
    }
  });
  saveState();
  toast(`Current session set to day ${day.trainingDay}`);
  render();
}

function changeSelectedDayWorkout() {
  const day = selectedPlanDay();
  const workout = $("#planWorkoutSelect")?.value;
  if (!day || !workout) return;
  state.config.workoutOverrides[day.trainingDay] = workout;
  day.workout = workout;
  day.isRest = false;
  day.entries = buildWorkoutEntries(day, workout, exposureBeforeTrainingDay(day.trainingDay));
  saveState();
  toast("Workout updated");
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "exercise-snacks-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function resetData() {
  if (!confirm("Reset all local Exercise Snacks progress?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  applyConfigToControls();
  render();
  toast("Reset complete");
}

function saveProfile() {
  state.config.profile = normalizeProfile({
    bodyWeightKg: $("#profileBodyWeightKg").value,
    heightCm: $("#profileHeightCm").value,
    maxPullups: $("#profileMaxPullups").value,
    maxDips: $("#profileMaxDips").value,
    maxPushups: $("#profileMaxPushups").value,
    maxHandstandPushups: $("#profileMaxHandstandPushups").value,
  });
  saveState();
  render();
  toast("Profile saved");
}

function notificationSupportText() {
  if (!("Notification" in window)) return "This browser does not support local notifications.";
  if (Notification.permission === "granted") return "Allowed. Reminders can appear for planned breaks while the app is open or installed.";
  if (Notification.permission === "denied") return "Blocked in this browser. Change site permissions to use reminders.";
  return "Not enabled yet. The browser will ask for permission.";
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("Notifications are not supported here");
    return false;
  }
  if (Notification.permission === "denied") {
    toast("Notifications are blocked in browser settings");
    return false;
  }
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  const enabled = permission === "granted";
  state.config.notificationsEnabled = enabled;
  $("#notificationsEnabled").checked = enabled;
  if (enabled) {
    playChime({ force: true });
    showVisualAlert("Notifications ready");
  }
  saveState();
  renderSettings();
  scheduleNotifications();
  toast(enabled ? "Notifications and chime enabled" : "Notifications not enabled");
  return enabled;
}

function getChimeContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!chimeContext) chimeContext = new AudioContextCtor();
  return chimeContext;
}

async function playChime(options = {}) {
  if (!options.force && !state?.config?.notificationsEnabled) return false;
  const context = getChimeContext();
  if (!context) {
    toast("Audio is not supported here");
    return false;
  }
  if (context.state === "suspended") {
    await context.resume();
  }
  const now = context.currentTime;
  const notes = [
    { frequency: 659.25, start: 0, duration: 0.24, type: "triangle" },
    { frequency: 880, start: 0.22, duration: 0.24, type: "triangle" },
    { frequency: 1318.51, start: 0.44, duration: 0.42, type: "square" },
  ];
  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
    gain.gain.setValueAtTime(0.0001, now + note.start);
    gain.gain.exponentialRampToValueAtTime(0.42, now + note.start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + note.start);
    oscillator.stop(now + note.start + note.duration + 0.03);
  });
  return true;
}

function showVisualAlert(message = "Exercise Snacks") {
  const pulse = $("#alertPulse");
  const text = $("#alertPulseText");
  if (!pulse || !text) return;
  text.textContent = message;
  pulse.hidden = false;
  pulse.style.animation = "none";
  pulse.offsetHeight;
  pulse.style.animation = "";
  window.setTimeout(() => {
    pulse.hidden = true;
  }, 2800);
}

function clearNotificationTimers() {
  notificationTimers.forEach((timer) => window.clearTimeout(timer));
  notificationTimers = [];
}

function scheduleNotifications() {
  clearNotificationTimers();
  const canShowBrowserNotification = Boolean(
    state?.config?.notificationsEnabled && "Notification" in window && Notification.permission === "granted",
  );
  const canShowInAppAlert = Boolean(state?.config?.notificationsEnabled);
  if (!canShowBrowserNotification && !canShowInAppAlert) return;
  const day = getNextDay();
  if (!day) return;

  const slots = new Map();
  day.entries.forEach((entry, index) => {
    if (entry.status !== "Planned") return;
    const slot = slotForIndex(index);
    const time = plannedTimeForIndex(index);
    const key = `${slot}|${time}`;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(entry);
  });

  for (const [key, entries] of slots) {
    const [slot, time] = key.split("|");
    const delay = millisecondsUntil(time);
    if (delay < 0) continue;
    notificationTimers.push(window.setTimeout(() => showBreakNotification(slot, time, entries, {
      allowWithoutPermission: canShowInAppAlert,
    }), delay));
  }
}

function millisecondsUntil(time) {
  const match = String(time).match(/(\d{2}):(\d{2})/);
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (String(time).includes("next day")) target.setDate(target.getDate() + 1);
  const plusDays = String(time).match(/\+(\d+) days/);
  if (plusDays) target.setDate(target.getDate() + Number(plusDays[1]));
  return target.getTime() - now.getTime();
}

async function showBreakNotification(slot, time, entries, flags = {}) {
  if (!entries.length) return;
  if (!flags.allowWithoutPermission && Notification.permission !== "granted") return;
  playChime({ force: Boolean(flags.forceChime) });
  const title = `Exercise Snacks: Break ${slot}`;
  const body = entries.map((entry) => `${entry.exercise}: ${entry.targetReps}`).join(" - ");
  showVisualAlert(`Break ${slot} - ${time}`);
  if (Notification.permission !== "granted") return;
  const options = {
    body: `${time} - ${body}`,
    tag: `exercise-snacks-${slot}-${time}`,
    icon: "./icon.svg",
    badge: "./icon.svg",
    renotify: true,
  };
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification(title, options);
      return;
    }
  } catch (error) {
    // Fall back to page notifications when service-worker notifications are unavailable.
  }
  new Notification(title, options);
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "done") markDone(id);
  if (action === "actual") openActual(id);
  if (action === "skip") skipEntry(id);
  if (action === "skip-day") skipCurrentDay();
  if (action === "reset-today") resetToday();
  if (action === "set-current-day") setCurrentTrainingDay();
  if (action === "change-day-workout") changeSelectedDayWorkout();
  if (action === "enable-notifications") enableNotifications();
  if (action === "save-profile") saveProfile();
  if (action === "export") exportData();
  if (action === "reset") resetData();
});

document.addEventListener("change", (event) => {
  if (event.target?.id === "nightMode") {
    state.config.nightMode = event.target.checked;
    applyTheme();
    saveState();
    toast(state.config.nightMode ? "Night mode on" : "Night mode off");
    return;
  }
  if (event.target?.id !== "planDaySelect") return;
  const day = selectedPlanDay();
  const workoutSelect = $("#planWorkoutSelect");
  if (day && workoutSelect) workoutSelect.value = day.workout;
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active-view"));
    tab.classList.add("active");
    $(`#${tab.dataset.view}View`).classList.add("active-view");
  });
});

$("#prepareDay").addEventListener("click", () => {
  syncConfigFromControls();
  if (state.config.notificationsEnabled && (!("Notification" in window) || Notification.permission !== "granted")) {
    enableNotifications();
  }
  renderToday();
  toast("Break schedule updated");
});

$("#intervalMinutes").addEventListener("change", () => {
  refreshClockSuggestion();
});

$("#notificationsEnabled").addEventListener("change", async () => {
  if ($("#notificationsEnabled").checked) {
    const ok = await enableNotifications();
    if (!ok) $("#notificationsEnabled").checked = false;
  } else {
    state.config.notificationsEnabled = false;
    saveState();
    clearNotificationTimers();
    toast("Notifications off");
  }
});

$("#saveActual").addEventListener("click", saveActual);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installButton").hidden = false;
});

$("#installButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installButton").hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

state = loadState();
populateScheduleControls();
applyConfigToControls();
render();
setInterval(refreshClockSuggestion, 30000);
