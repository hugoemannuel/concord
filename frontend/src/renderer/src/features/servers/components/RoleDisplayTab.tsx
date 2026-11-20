import Input from '../../../shared/ui/Input'
import Switch from '../../../shared/ui/Switch'
import { parseColorCss, roleColorCss, type Role } from '../lib/permissions'
import type { RoleDraft, RoleEdits } from '../lib/roleEdits'

const SWATCHES = [
  0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6, 0x607d8b
]

/**
 * Aba "Exibição" do editor de cargo: nome, cor, grupo próprio na lista de
 * membros e se qualquer pessoa pode mencionar o cargo.
 */
export default function RoleDisplayTab({
  role,
  draft,
  onChange
}: {
  role: Role
  draft: RoleDraft
  onChange: <K extends keyof RoleEdits>(field: K, value: RoleEdits[K]) => void
}): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Input
        label="Nome do cargo"
        value={draft.name}
        maxLength={32}
        disabled={!!role.is_system}
        onChange={(e) => onChange('name', e.target.value)}
      />

      <div>
        <p className="mb-2 text-sm font-medium text-gray-300">Cor do cargo</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange('color', null)}
            aria-label="Sem cor"
            title="Sem cor"
            className={`h-7 w-7 cursor-pointer rounded-full border text-xs text-gray-400 ${
              draft.color === null ? 'border-[var(--text-strong)]' : 'border-normal'
            }`}
          >
            ∅
          </button>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange('color', c)}
              aria-label={`Cor ${roleColorCss(c)}`}
              className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
                draft.color === c ? 'border-[var(--text-strong)]' : 'border-transparent'
              }`}
              style={{ background: roleColorCss(c) }}
            />
          ))}
          <input
            type="color"
            aria-label="Escolher outra cor"
            value={roleColorCss(draft.color) ?? '#99aab5'}
            onChange={(e) => onChange('color', parseColorCss(e.target.value))}
            className="h-7 w-9 cursor-pointer rounded border border-normal bg-transparent p-0"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          O nome de quem tem o cargo aparece com essa cor (vale a do cargo mais alto que tem
          cor).
        </p>
      </div>

      {!role.is_system && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-strong">Exibir membros separadamente</p>
            <p className="text-xs text-gray-400">
              Quem está online com este cargo ganha um grupo próprio na lista de membros.
            </p>
          </div>
          <Switch
            checked={draft.hoist}
            label="Exibir membros separadamente"
            onChange={(v) => onChange('hoist', v)}
          />
        </div>
      )}

      {!role.is_system && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle bg-fg/3 px-4 py-3">
          <p className="text-ds-sm font-semibold text-strong">
            Permitir que qualquer pessoa mencione este cargo
          </p>
          <Switch
            checked={draft.mentionable}
            label="Permitir que qualquer pessoa mencione este cargo"
            onChange={(v) => onChange('mentionable', v)}
          />
        </div>
      )}
    </div>
  )
}
