'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Award, ChevronRight, CircleCheck, Clock, AlertCircle } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { getDb } from '@/lib/db'
import { saveProgressAndDetectCompletions } from '@/lib/certification-engine'
import { generateCertificate } from '@/lib/certificate-generator'
import type { CertificationPathway, TechnicianProgress, DigitalCertificate } from '@/lib/certification-types'
import { CertificateViewer } from './CertificateViewer'
import { LogSupervisedProcedure } from './LogSupervisedProcedure'

interface CertificationDashboardProps {
  technicianId: string
  technicianName: string
}

export function CertificationDashboard({ technicianId, technicianName }: CertificationDashboardProps) {
  const t = useTranslations('certification')

  const [pathways, setPathways] = useState<CertificationPathway[]>([])
  const [progressMap, setProgressMap] = useState<Map<string, TechnicianProgress>>(new Map())
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCertificate, setSelectedCertificate] = useState<DigitalCertificate | null>(null)
  const [showLogProcedure, setShowLogProcedure] = useState(false)
  const [activePathwayId, setActivePathwayId] = useState<string | null>(null)

  async function loadData() {
    const db = getDb()
    const [allPathways, allProgress, allCerts] = await Promise.all([
      db.certification_pathways.toArray(),
      db.technician_progress.where('technicianId').equals(technicianId).toArray(),
      db.digital_certificates.where('technicianId').equals(technicianId).sortBy('issuedAt'),
    ])

    setPathways(allPathways)
    setProgressMap(new Map(allProgress.map((p) => [p.pathwayId, p])))
    setCertificates(allCerts.reverse()) // most recent first
  }

  async function refreshProgress(pathway: CertificationPathway) {
    const { progress, newlyCompletedMilestoneIds } = await saveProgressAndDetectCompletions(
      technicianId,
      pathway,
    )

    setProgressMap((prev) => new Map(prev).set(pathway.id, progress))

    // Generate certificates for newly completed milestones
    for (const milestoneId of newlyCompletedMilestoneIds) {
      const milestone = pathway.milestones.find((m) => m.id === milestoneId)
      if (!milestone) continue
      try {
        const cert = await generateCertificate({
          technicianId,
          technicianName,
          pathway,
          milestoneName: milestone.name,
        })
        const db = getDb()
        await db.digital_certificates.put(cert)
        setCertificates((prev) => [cert, ...prev])
      } catch {
        // Certificate generation failure is non-blocking
      }
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [technicianId])

  // Refresh progress for all pathways on mount
  useEffect(() => {
    if (pathways.length === 0) return
    pathways.forEach((p) => refreshProgress(p))
  }, [pathways.length])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (pathways.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title={t('noCertificationPaths')}
        description={t('noCertificationPathsHint')}
      />
    )
  }

  return (
    <div className="space-y-4">
      {pathways.map((pathway) => {
        const progress = progressMap.get(pathway.id)
        return (
          <PathwayCard
            key={pathway.id}
            pathway={pathway}
            progress={progress ?? null}
            certificates={certificates.filter((c) => c.pathwayId === pathway.id)}
            onRefresh={() => refreshProgress(pathway)}
            onViewCertificate={setSelectedCertificate}
            onLogProcedure={() => {
              setActivePathwayId(pathway.id)
              setShowLogProcedure(true)
            }}
          />
        )
      })}

      {/* Certificate viewer modal */}
      {selectedCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-foreground">{t('certificate')}</h2>
              <button
                onClick={() => setSelectedCertificate(null)}
                className="text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <CertificateViewer certificate={selectedCertificate} />
            </div>
          </div>
        </div>
      )}

      {/* Log supervised procedure modal */}
      {showLogProcedure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-foreground">{t('logSupervisedProcedure')}</h2>
              <button
                onClick={() => setShowLogProcedure(false)}
                className="text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <LogSupervisedProcedure
                technicianId={technicianId}
                supervisorId="current-supervisor" // resolved from auth context in production
                onLogged={() => {
                  setShowLogProcedure(false)
                  if (activePathwayId) {
                    const pathway = pathways.find((p) => p.id === activePathwayId)
                    if (pathway) refreshProgress(pathway)
                  }
                }}
                onCancel={() => setShowLogProcedure(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PathwayCard
// ---------------------------------------------------------------------------

interface PathwayCardProps {
  pathway: CertificationPathway
  progress: TechnicianProgress | null
  certificates: DigitalCertificate[]
  onRefresh: () => void
  onViewCertificate: (cert: DigitalCertificate) => void
  onLogProcedure: () => void
}

function PathwayCard({
  pathway,
  progress,
  certificates,
  onRefresh,
  onViewCertificate,
  onLogProcedure,
}: PathwayCardProps) {
  const t = useTranslations('certification')
  const [expanded, setExpanded] = useState(true)

  const sorted = [...pathway.milestones].sort((a, b) => a.order - b.order)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Pathway header */}
      <div className="bg-muted/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award size={20} className="text-primary dark:text-primary shrink-0" />
          <div>
            <h3 className="font-semibold text-foreground">{pathway.name}</h3>
            <p className="text-xs text-muted-foreground">{pathway.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {progress && (
            <span className="text-sm font-medium text-primary dark:text-primary">
              {progress.overallPercent}%
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-300"
            aria-label={expanded ? t('collapse') : t('expand')}
          >
            <DirectionalIcon category="navigation">
              <ChevronRight
                size={18}
                className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            </DirectionalIcon>
          </button>
        </div>
      </div>

      {/* Overall progress bar */}
      {progress && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{t('overallProgress')}</span>
            <span>{progress.overallPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress.overallPercent}%` }}
            />
          </div>
          {progress.currentLevel && (
            <p className="text-xs text-primary dark:text-primary mt-1">
              {t('currentLevel')}: {progress.currentLevel}
            </p>
          )}
        </div>
      )}

      {/* Milestone list */}
      {expanded && (
        <div className="divide-y divide-border dark:divide-gray-800">
          {sorted.map((milestone) => {
            const mp = progress?.milestoneProgress.find((p) => p.milestoneId === milestone.id)
            const current = mp?.currentValue ?? 0
            const target = mp?.targetValue ?? milestone.requirement.target
            const complete = current >= target
            const pct = Math.min(Math.round((current / target) * 100), 100)

            return (
              <div key={milestone.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {complete ? (
                      <CircleCheck size={18} className="text-green-500" />
                    ) : current > 0 ? (
                      <Clock size={18} className="text-yellow-500" />
                    ) : (
                      <AlertCircle size={18} className="text-gray-300 dark:text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {milestone.name}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {current}/{target}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {milestone.description}
                    </p>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {complete && mp?.completedAt && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {t('completedOn', { date: new Date(mp.completedAt).toLocaleDateString() })}
                      </p>
                    )}
                    {milestone.category === 'supervised_procedures' && !complete && (
                      <button
                        onClick={onLogProcedure}
                        className="mt-1 text-xs text-primary dark:text-primary hover:underline"
                      >
                        + {t('logSupervisedProcedure')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Certificates section */}
      {certificates.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t('earnedCertificates')}
          </p>
          <div className="space-y-2">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <Award size={14} className="text-yellow-500 shrink-0" />
                  <span className="text-foreground">{cert.milestoneName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(cert.issuedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => onViewCertificate(cert)}
                    className="text-xs text-primary dark:text-primary hover:underline"
                  >
                    {t('view')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh button */}
      <div className="border-t border-border px-4 py-2 flex justify-end">
        <button
          onClick={onRefresh}
          className="text-xs text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-300"
        >
          {t('refreshProgress')}
        </button>
      </div>
    </div>
  )
}
