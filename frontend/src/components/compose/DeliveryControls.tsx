import React from 'react';

interface DeliveryControlsProps {
  delayMs: string;
  onDelayMsChange: (value: string) => void;
  hourlyLimit: string;
  onHourlyLimitChange: (value: string) => void;
}

export const DeliveryControls: React.FC<DeliveryControlsProps> = ({
  delayMs,
  onDelayMsChange,
  hourlyLimit,
  onHourlyLimitChange,
}) => {
  return (
    <div className="flex items-center gap-6 py-2 border-b border-slate-100 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-500 font-medium">Delay between 2 emails</span>
        <input
          type="text"
          value={delayMs}
          onChange={(e) => onDelayMsChange(e.target.value)}
          placeholder="00"
          className="w-16 bg-[#f4f6f5] border-none rounded-lg px-2.5 py-1 text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00a843]"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-slate-500 font-medium">Hourly Limit</span>
        <input
          type="text"
          value={hourlyLimit}
          onChange={(e) => onHourlyLimitChange(e.target.value)}
          placeholder="00"
          className="w-16 bg-[#f4f6f5] border-none rounded-lg px-2.5 py-1 text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00a843]"
        />
      </div>
    </div>
  );
};
