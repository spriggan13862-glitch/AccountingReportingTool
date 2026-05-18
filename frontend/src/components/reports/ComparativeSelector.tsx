interface Stack {
  label: string
  asOfDate: string
  scenarioIds: string
}

interface Props {
  stacks: Stack[]
  onChange: (stacks: Stack[]) => void
}

export function ComparativeSelector({ stacks, onChange }: Props) {
  const addStack = () => {
    onChange([...stacks, { label: `Period ${stacks.length + 1}`, asOfDate: '', scenarioIds: '' }])
  }

  const removeStack = (i: number) => {
    onChange(stacks.filter((_, idx) => idx !== i))
  }

  const updateStack = (i: number, field: keyof Stack, value: string) => {
    onChange(stacks.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  return (
    <div className="space-y-2">
      {stacks.map((stack, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            className="border rounded px-2 py-1 text-sm w-24"
            placeholder="Label"
            value={stack.label}
            onChange={(e) => updateStack(i, 'label', e.target.value)}
          />
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={stack.asOfDate}
            onChange={(e) => updateStack(i, 'asOfDate', e.target.value)}
          />
          <input
            type="text"
            className="border rounded px-2 py-1 text-sm w-20"
            placeholder="Scen IDs"
            value={stack.scenarioIds}
            onChange={(e) => updateStack(i, 'scenarioIds', e.target.value)}
          />
          {stacks.length > 1 && (
            <button onClick={() => removeStack(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
          )}
        </div>
      ))}
      <button onClick={addStack} className="text-blue-600 hover:text-blue-800 text-sm">+ Add period</button>
    </div>
  )
}
