package apperrors

import (
	"context"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// O painel de erros, só para os devs (dev_badge_users, a mesma regra do
// painel das lives: o wire passa o liveobs.ReportRepository como devChecker).
const (
	defaultDays = 7
	maxDays     = 14
)

var (
	errDays      = errors.New("days: de 1 a 14")
	errSource    = errors.New("source: renderer, main, mobile ou backend")
	errVersion   = errors.New("version: até 32 bytes")
	reHexSHA256  = regexp.MustCompile(`^[0-9a-f]{64}$`)
	panelSources = map[string]bool{"": true, SourceRenderer: true, SourceMain: true, SourceMobile: true, SourceBackend: true}
)

type devChecker interface {
	IsDev(ctx context.Context, userID string) (bool, error)
}

type reportStore interface {
	Groups(ctx context.Context, q groupQuery) ([]GroupSummary, error)
	Versions(ctx context.Context, from, to time.Time, source string) ([]string, error)
	VersionIndex(ctx context.Context) ([]groupVersions, error)
	Group(ctx context.Context, fingerprint string, from, to time.Time) (GroupSummary, string, error)
	Screens(ctx context.Context, fingerprint string, from, to time.Time) ([]ScreenCount, error)
	Recent(ctx context.Context, fingerprint string, from, to time.Time, limit int) ([]Occurrence, error)
}

type stackTranslator interface {
	Translate(stack string) string
}

// ReportHandler: GET /obs/errors e GET /obs/errors/:fingerprint.
type ReportHandler struct {
	devs       devChecker
	store      reportStore
	translator stackTranslator
	now        func() time.Time
}

func NewReportHandler(devs devChecker, store reportStore, translator stackTranslator) *ReportHandler {
	return &ReportHandler{devs: devs, store: store, translator: translator, now: time.Now}
}

// List: GET /obs/errors?days=N&source=&version=.
func (h *ReportHandler) List(c *gin.Context) {
	q, ok := h.listQuery(c)
	if !ok {
		return
	}
	report, err := h.loadList(c.Request.Context(), q)
	if err != nil {
		failed(c, err)
		return
	}
	c.JSON(http.StatusOK, report)
}

// Detail: GET /obs/errors/:fingerprint?days=N. 404 se o grupo não existe.
func (h *ReportHandler) Detail(c *gin.Context) {
	q, ok := h.window(c)
	if !ok {
		return
	}
	fp := c.Param("fingerprint")
	if !reHexSHA256.MatchString(fp) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	detail, err := h.loadDetail(c.Request.Context(), fp, q)
	if errors.Is(err, ErrGroupNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		failed(c, err)
		return
	}
	c.JSON(http.StatusOK, detail)
}

// window confere se é dev e lê days; false = já respondeu.
func (h *ReportHandler) window(c *gin.Context) (groupQuery, bool) {
	dev, err := h.devs.IsDev(c.Request.Context(), c.GetString("userID"))
	if err != nil || !dev {
		deny(c, err)
		return groupQuery{}, false
	}
	days, err := parseDays(c.Query("days"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return groupQuery{}, false
	}
	to := h.now()
	return groupQuery{From: to.Add(-time.Duration(days) * 24 * time.Hour), To: to}, true
}

func (h *ReportHandler) listQuery(c *gin.Context) (groupQuery, bool) {
	q, ok := h.window(c)
	if !ok {
		return q, false
	}
	q.Source, q.Version = c.Query("source"), c.Query("version")
	if err := checkFilters(q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return q, false
	}
	return q, true
}

func checkFilters(q groupQuery) error {
	if !panelSources[q.Source] {
		return errSource
	}
	if len(q.Version) > maxVersion {
		return errVersion
	}
	return nil
}

func (h *ReportHandler) loadList(ctx context.Context, q groupQuery) (ErrorsReport, error) {
	groups, err := h.store.Groups(ctx, q)
	if err != nil {
		return ErrorsReport{}, err
	}
	versions, err := h.store.Versions(ctx, q.From, q.To, q.Source)
	if err != nil {
		return ErrorsReport{}, err
	}
	index, err := h.store.VersionIndex(ctx)
	if err != nil {
		return ErrorsReport{}, err
	}
	return buildReport(q.From, q.To, versions, groups, index), nil
}

func (h *ReportHandler) loadDetail(ctx context.Context, fp string, q groupQuery) (GroupDetail, error) {
	group, stack, err := h.store.Group(ctx, fp, q.From, q.To)
	if err != nil {
		return GroupDetail{}, err
	}
	screens, err := h.store.Screens(ctx, fp, q.From, q.To)
	if err != nil {
		return GroupDetail{}, err
	}
	recent, err := h.store.Recent(ctx, fp, q.From, q.To, maxRecent)
	if err != nil {
		return GroupDetail{}, err
	}
	index, err := h.store.VersionIndex(ctx)
	if err != nil {
		return GroupDetail{}, err
	}
	return buildDetail(group, stack, h.translator.Translate(stack), screens, recent, index), nil
}

// buildDetail: o grupo com o selo e as listas nunca nulas.
func buildDetail(group GroupSummary, stack, translated string, screens []ScreenCount, recent []Occurrence, index []groupVersions) GroupDetail {
	groups := []GroupSummary{group}
	fillLists(&groups[0])
	markNewInVersion(groups, index)
	if screens == nil {
		screens = []ScreenCount{}
	}
	if recent == nil {
		recent = []Occurrence{}
	}
	return GroupDetail{Group: groups[0], Stack: stack, Translated: translated, Screens: screens, Recent: recent}
}

func deny(c *gin.Context, err error) {
	if err != nil {
		failed(c, err)
		return
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "devs only"})
}

func failed(c *gin.Context, err error) {
	log.Printf("[apperrors] painel: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load"})
}

func parseDays(raw string) (int, error) {
	if raw == "" {
		return defaultDays, nil
	}
	days, err := strconv.Atoi(raw)
	if err != nil || days < 1 || days > maxDays {
		return 0, errDays
	}
	return days, nil
}
