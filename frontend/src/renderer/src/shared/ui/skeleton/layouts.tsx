import { messageSkeletonRows, pct, skeletonWidths } from '../../lib/skeleton'
import { Skeleton, SkeletonRegion } from './Skeleton'

// Cada skeleton repete a estrutura (padding, gap e altura de linha) da linha
// real: quando o conteúdo chega, nada mexe de lugar. Alturas de linha dos
// tokens ds-*: xs 16px, sm 18px, md 20px, chat 22px.

/** Uma linha de texto: o bloco tem a altura da linha real, a barra fica no meio. */
function Line({
  height,
  barClass = 'h-3',
  width
}: {
  /** Altura da linha de texto real (classe de altura do Tailwind). */
  height: string
  barClass?: string
  /** Largura da barra, em %. */
  width: number
}): React.JSX.Element {
  return (
    <div className={`flex items-center ${height}`}>
      <Skeleton className={barClass} style={pct(width)} />
    </div>
  )
}

/* ------------------------------ Chat ------------------------------ */

const MESSAGE_ROWS = messageSkeletonRows(14)

/** Mensagem: avatar de 40px, nome + hora e de 1 a 3 linhas (text-ds-chat, 22px). */
function MessageRowSkeleton({
  namePx,
  lines
}: {
  namePx: number
  lines: number[]
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 gap-3 px-4 py-1.5">
      <Skeleton circle className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex h-[22px] items-center gap-2">
          <Skeleton className="h-3.5" style={{ width: namePx }} />
          <Skeleton className="h-2.5 w-12" />
        </div>
        {lines.map((w, i) => (
          <Line key={i} height="h-[22px]" barClass="h-3.5" width={w} />
        ))}
      </div>
    </div>
  )
}

/**
 * Lista de mensagens carregando. Encosta embaixo (como o chat) e corta o que
 * passar de cima, então preenche qualquer altura de janela.
 */
export function MessageListSkeleton({
  label = 'Carregando mensagens…'
}: {
  label?: string
}): React.JSX.Element {
  return (
    <SkeletonRegion label={label} className="flex h-full flex-col justify-end overflow-hidden py-4">
      {MESSAGE_ROWS.map((row, i) => (
        <MessageRowSkeleton key={i} namePx={row.namePx} lines={row.lines} />
      ))}
    </SkeletonRegion>
  )
}

/* ------------------------ Canais e membros ------------------------ */

const CHANNEL_WIDTHS = skeletonWidths(12, { min: 35, max: 85, seed: 11 })

/** Canais (texto ou voz): py-1 + linha de 24px = 32px, ícone de 20px + nome. */
export function ChannelListSkeleton({
  count,
  offset = 0
}: {
  count: number
  /** Desloca as larguras para a lista de voz não repetir a de texto. */
  offset?: number
}): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando canais…" className="flex flex-col gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-8 items-center gap-2 pl-2.5 pr-2.5">
          <Skeleton circle className="h-4 w-4" />
          <Skeleton
            className="h-3.5"
            style={pct(CHANNEL_WIDTHS[(i + offset) % CHANNEL_WIDTHS.length])}
          />
        </div>
      ))}
    </SkeletonRegion>
  )
}

const MEMBER_WIDTHS = skeletonWidths(12, { min: 40, max: 80, seed: 5 })

/** Membro: px-2 py-1, avatar de 32px, nome (20px) e @usuário (16px, -mt-0.5) = 42px. */
function MemberRowSkeleton({ index }: { index: number }): React.JSX.Element {
  const nameWidth = MEMBER_WIDTHS[index % MEMBER_WIDTHS.length]
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <Skeleton circle className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <Line height="h-5" barClass="h-3.5" width={nameWidth} />
        <div className="-mt-0.5 flex h-4 items-center">
          <Skeleton className="h-2.5" style={pct(Math.max(25, nameWidth - 25))} />
        </div>
      </div>
    </div>
  )
}

/** Lista de membros por grupo (título de 18px + linhas), como a real. */
export function MemberListSkeleton({
  groups = [5, 4]
}: {
  /** Quantidade de membros de cada grupo. */
  groups?: number[]
}): React.JSX.Element {
  // Índice corrido entre os grupos: as larguras não se repetem de um grupo para o outro.
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((sum, n) => sum + n, 0))
  return (
    <SkeletonRegion label="Carregando membros…" className="space-y-6">
      {groups.map((count, g) => (
        <div key={g}>
          <div className="mb-1 flex h-[18px] items-center">
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: count }, (_, i) => (
              <MemberRowSkeleton key={i} index={starts[g] + i} />
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/* ------------------------ DMs, amigos, servidores ------------------------ */

const DM_WIDTHS = skeletonWidths(10, { min: 35, max: 80, seed: 23 })

/** Conversa da barra lateral: px-2 py-1.5, avatar de 32px e nome (20px) = 44px. */
export function DmListSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando conversas…" className="flex flex-col gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton circle className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <Line height="h-5" barClass="h-3.5" width={DM_WIDTHS[i % DM_WIDTHS.length]} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

const PERSON_WIDTHS = skeletonWidths(10, { min: 20, max: 40, seed: 31 })

/**
 * Linha da página de amigos (PersonRow): py-2.5, avatar de 32px, nome (20px) e
 * subtítulo (18px), com a borda de cima. Ações à direita só nas listas que as têm.
 */
export function PersonListSkeleton({
  count = 7,
  actions = 2
}: {
  count?: number
  /** Botões redondos de 36px à direita (0 em listas sem ação). */
  actions?: number
}): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando…" className="mt-4">
      <div className="mb-2 flex h-[18px] items-center">
        <Skeleton className="h-2.5 w-28" />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="mx-[-10px] flex items-center gap-3 border-t border-subtle px-2.5 py-2.5"
        >
          <Skeleton circle className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <Line
              height="h-5"
              barClass="h-3.5"
              width={PERSON_WIDTHS[i % PERSON_WIDTHS.length] + 15}
            />
            <Line
              height="h-[18px]"
              barClass="h-2.5"
              width={PERSON_WIDTHS[(i + 3) % PERSON_WIDTHS.length]}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {Array.from({ length: actions }, (_, a) => (
              <Skeleton key={a} circle className="h-9 w-9" />
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Ícones da barra de servidores: 48px, arredondados como os reais, com o mesmo gap. */
export function ServerRailSkeleton({ count = 4 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando servidores…" className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-12 w-12 rounded-3xl" />
      ))}
    </SkeletonRegion>
  )
}

/* ------------------------------ Perfil ------------------------------ */

/** Barras no lugar do "Sobre mim" (text-sm com leading-snug, ~19px por linha). */
export function ProfileBioSkeleton(): React.JSX.Element {
  return (
    <div className="mt-3">
      <Line height="h-[19px]" barClass="h-3" width={92} />
      <Line height="h-[19px]" barClass="h-3" width={58} />
    </div>
  )
}

/** Seção do bloco de informações do cartão (título xs + uma linha). */
function ProfileInfoSectionSkeleton({ width }: { width: number }): React.JSX.Element {
  return (
    <div>
      <Skeleton className="mb-1.5 h-2.5 w-20" />
      <Skeleton className="h-3" style={pct(width)} />
    </div>
  )
}

/** Informações que dependem de outra chamada (cargos, em comum…). */
export function ProfileInfoSkeleton({ sections = 2 }: { sections?: number }): React.JSX.Element {
  return (
    <>
      {Array.from({ length: sections }, (_, i) => (
        <ProfileInfoSectionSkeleton key={i} width={i % 2 === 0 ? 70 : 45} />
      ))}
    </>
  )
}

/** Fileira de badges ao lado do username (mesma caixa da real, 3 de 22px). */
export function BadgeRowSkeleton(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando badges…"
      className="flex shrink-0 items-center gap-0.5 rounded-md border border-subtle bg-input px-1 py-0.5"
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex h-[22px] w-[22px] items-center justify-center">
          <Skeleton circle className="h-5 w-5" />
        </span>
      ))}
    </div>
  )
}

/** Grade de badges do modal: 4 por linha, quadrados com rounded-xl, gap-2. */
export function BadgeGridSkeleton({ count = 8 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando badges…" className="mt-5 grid grid-cols-4 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-square rounded-xl" />
      ))}
    </SkeletonRegion>
  )
}

/** Detalhe do badge (painel da direita do modal) enquanto a lista não chega. */
export function BadgeDetailSkeleton(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col items-center justify-center gap-4 text-center"
    >
      <Skeleton circle className="h-32 w-32" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-3 w-44" />
    </div>
  )
}

/* ------------------------------ Convite ------------------------------ */

/** Prévia do convite: ícone de 64px, linha de apoio, nome (ds-xl, 32px) e contagens. */
export function InvitePreviewSkeleton(): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando convite…" className="flex flex-col items-center text-center">
      <Skeleton className="h-16 w-16 rounded-2xl" />
      <div className="mt-4 flex h-[18px] items-center">
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="mt-1 flex h-8 items-center">
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="mt-2 flex h-[18px] items-center gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </SkeletonRegion>
  )
}

/** Botão de largura total (py-2.5 + linha de 18px = 38px). */
export function ButtonSkeleton({ className = '' }: { className?: string }): React.JSX.Element {
  return <Skeleton className={`h-[38px] w-full rounded-lg ${className}`} />
}

/* ------------------------------ Listas ------------------------------ */

/** Banido: px-4 py-3, avatar de 32px, nome (20px) e motivo (16px). */
export function BanListSkeleton({ count = 3 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion
      label="Carregando banimentos…"
      className="divide-y divide-subtle rounded-lg border border-subtle"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton circle className="h-8 w-8" />
            <div>
              <Line height="h-5" barClass="h-3.5" width={100} />
              <Line height="h-4" barClass="h-2.5" width={100} />
            </div>
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Card do quadro de propostas: p-3, título, descrição e rodapé com avatar. */
function ProposalCardSkeleton({ lines }: { lines: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-fg/3 p-3">
      <div>
        <Skeleton className="h-3.5 w-4/5" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="mt-2 h-2.5" style={pct(i === lines - 1 ? 55 : 95)} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Skeleton circle className="h-5 w-5" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  )
}

/** Colunas do quadro de propostas com cards no lugar. */
export function ProposalBoardSkeleton({
  columns
}: {
  columns: ReadonlyArray<{ status: string; title: string; hint: string }>
}): React.JSX.Element {
  return (
    <SkeletonRegion
      label="Carregando propostas…"
      className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 py-4"
    >
      {columns.map((col, c) => (
        <section
          key={col.status}
          className="flex min-h-0 min-w-64 flex-1 basis-64 flex-col rounded-2xl border border-subtle bg-surface"
        >
          <div className="shrink-0 px-3 pb-2 pt-3">
            <h2 className="text-sm font-semibold text-strong">{col.title}</h2>
            <p className="text-[11px] text-gray-500">{col.hint}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3">
            {Array.from({ length: 3 - (c % 2) }, (_, i) => (
              <ProposalCardSkeleton key={i} lines={(c + i) % 2 === 0 ? 2 : 1} />
            ))}
          </div>
        </section>
      ))}
    </SkeletonRegion>
  )
}

/** Comentário de proposta: avatar e duas linhas de texto. */
export function CommentListSkeleton({ count = 2 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando comentários…" className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton circle className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-2.5 w-full" />
            <Skeleton className="mt-1.5 h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Mensagem fixada no popover: card com autor e texto. */
export function PinnedListSkeleton({ count = 3 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando mensagens fixadas…" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-subtle bg-fg/3 p-3">
          <div className="flex items-center gap-2">
            <Skeleton circle className="h-6 w-6" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-3 h-2.5 w-full" />
          <Skeleton className="mt-1.5 h-2.5" style={pct(i % 2 === 0 ? 60 : 85)} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Pads da mesa de som: grade de 2 colunas. */
export function SoundboardSkeleton({ count = 6 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando sons…" className="grid grid-cols-2 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-xl" />
      ))}
    </SkeletonRegion>
  )
}

/** Versão do changelog: título + data, depois linhas de notas. */
export function ChangelogSkeleton({ count = 2 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando novidades…" className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-subtle bg-surface p-4">
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="mt-3 h-3 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/* ------------------------------ Configurações ------------------------------ */

/**
 * Seção de configurações: título e opções (radio de 58px ou interruptor). O
 * `rows` de cada seção é a quantidade de opções.
 */
export function SettingsSectionsSkeleton({
  sections = [3, 1]
}: {
  sections?: number[]
}): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando configurações…" className="flex flex-col gap-8">
      {sections.map((rows, s) => (
        <div key={s} className={s < sections.length - 1 ? 'border-b border-subtle pb-6' : ''}>
          <Skeleton className="mb-3 h-3 w-56" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md bg-input px-3 py-2.5">
                <Skeleton circle className="h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <Line height="h-5" barClass="h-3.5" width={45 + ((s + i) % 3) * 12} />
                  <Line height="h-[18px]" barClass="h-2.5" width={70 - ((s + i) % 2) * 20} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/* ------------------------------ Telas inteiras ------------------------------ */

/** Cabeçalho do canal (h-14) enquanto o servidor abre. */
export function ChannelHeaderSkeleton(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle px-4"
    >
      <Skeleton circle className="h-5 w-5" />
      <Skeleton className="h-4 w-36" />
    </div>
  )
}

/**
 * Casca do app (barra de servidores, barra lateral e chat) enquanto a sessão é
 * confirmada. `notice` é o aviso de rede fora, que fica por cima.
 */
export function AppBootSkeleton({ notice }: { notice?: string }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando o app…" className="relative flex h-full">
      <aside className="flex h-full w-18 shrink-0 flex-col items-center gap-2 border-r border-subtle bg-tertiary py-3">
        <Skeleton className="h-12 w-12 rounded-3xl" />
        <div className="my-1 h-0.5 w-8 rounded-full bg-fg/10" />
        <ServerRailSkeleton count={5} />
      </aside>
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-subtle bg-secondary sm:flex">
        <div className="flex h-12 shrink-0 items-center border-b border-subtle px-2.5">
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
        <div className="px-2 py-3">
          <DmListSkeleton count={7} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeaderSkeleton />
        <div className="min-h-0 flex-1">
          <MessageListSkeleton />
        </div>
      </div>
      {notice && (
        <p className="absolute inset-x-0 bottom-4 text-center text-sm text-gray-400">{notice}</p>
      )}
    </SkeletonRegion>
  )
}

/** Resultado de uma ação por link (confirmar e-mail): título, texto e botão. */
export function AuthResultSkeleton({ label }: { label: string }): React.JSX.Element {
  return (
    <SkeletonRegion label={label}>
      <div className="flex h-8 items-center">
        <Skeleton className="h-6 w-3/4" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="mt-6 h-9 w-32 rounded-lg" />
    </SkeletonRegion>
  )
}

/** Opções do seletor de tela: p-2, miniatura 16:9 e o nome (text-xs, 16px). */
export function ScreenSourceGridSkeleton({ count = 4 }: { count?: number }): React.JSX.Element {
  return (
    <SkeletonRegion label="Carregando telas e janelas…" className="contents">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg bg-fg/[0.03] p-2">
          <Skeleton className="mb-2 aspect-video w-full rounded-md" />
          <Line height="h-4" barClass="h-2.5" width={55 + (i % 3) * 12} />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Campo de mensagem (48px) embaixo do chat, para a tela inteira em skeleton. */
export function ComposerSkeleton(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="shrink-0 px-4 pb-4 pt-2">
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  )
}
