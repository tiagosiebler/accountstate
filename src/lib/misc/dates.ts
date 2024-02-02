export interface TimeDifference {
  hours: number;
  minutes: number;
  seconds: number;
}

export function getTimeDiffInDates(
  oldDate: Date,
  newDate: Date,
): TimeDifference {
  const ms = Math.abs(
    new Date(newDate).getTime() - new Date(oldDate).getTime(),
  );
  return {
    hours: +(ms / 1000 / 60 / 60).toFixed(2), // Math.trunc(ms / 3600000),
    minutes: +(ms / 1000 / 60).toFixed(1), // Math.trunc((ms / 3600000) * 60) + ((ms / 3600000 ) * 60 % 1 !== 0 ? 1 : 0),
    seconds: +(ms / 1000).toFixed(0),
  };
}
