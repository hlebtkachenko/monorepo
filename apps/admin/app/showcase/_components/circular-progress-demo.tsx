import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
  CircularProgressValueText,
} from "@workspace/ui/components/circular-progress"

export function CircularProgressDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <CircularProgress value={25}>
        <CircularProgressIndicator>
          <CircularProgressTrack />
          <CircularProgressRange />
        </CircularProgressIndicator>
        <CircularProgressValueText />
      </CircularProgress>

      <CircularProgress value={70} size={72} thickness={6}>
        <CircularProgressIndicator>
          <CircularProgressTrack />
          <CircularProgressRange />
        </CircularProgressIndicator>
        <CircularProgressValueText />
      </CircularProgress>

      <CircularProgress value={100} size={64} thickness={5}>
        <CircularProgressIndicator>
          <CircularProgressTrack />
          <CircularProgressRange className="text-success" />
        </CircularProgressIndicator>
        <CircularProgressValueText />
      </CircularProgress>

      <CircularProgress value={null}>
        <CircularProgressIndicator>
          <CircularProgressTrack />
          <CircularProgressRange />
        </CircularProgressIndicator>
      </CircularProgress>
    </div>
  )
}
