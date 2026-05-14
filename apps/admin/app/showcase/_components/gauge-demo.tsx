import {
  Gauge,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "@workspace/ui/components/gauge"

export function GaugeDemo() {
  return (
    <div className="flex flex-wrap gap-8">
      <Gauge value={62}>
        <GaugeIndicator>
          <GaugeTrack />
          <GaugeRange />
        </GaugeIndicator>
        <GaugeValueText />
        <GaugeLabel>Default</GaugeLabel>
      </Gauge>

      <Gauge value={75} startAngle={-90} endAngle={90}>
        <GaugeIndicator>
          <GaugeTrack />
          <GaugeRange />
        </GaugeIndicator>
        <GaugeValueText />
        <GaugeLabel>Semi-circle</GaugeLabel>
      </Gauge>

      <Gauge value={90} size={160} thickness={12}>
        <GaugeIndicator>
          <GaugeTrack />
          <GaugeRange className="text-success" />
        </GaugeIndicator>
        <GaugeValueText />
        <GaugeLabel>Health</GaugeLabel>
      </Gauge>

      <Gauge value={null}>
        <GaugeIndicator>
          <GaugeTrack />
          <GaugeRange />
        </GaugeIndicator>
        <GaugeLabel>Loading</GaugeLabel>
      </Gauge>
    </div>
  )
}
