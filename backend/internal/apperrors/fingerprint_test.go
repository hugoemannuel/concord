package apperrors

import (
	"reflect"
	"regexp"
	"testing"
)

// goPanicStack: o formato do debug.Stack() chamado dentro do recovery.
const goPanicStack = `goroutine 42 [running]:
runtime/debug.Stack()
	/usr/lib/go/src/runtime/debug/stack.go:26 +0x5e
gin-quickstart/backend/internal/platform/recovery.Middleware.func1(0xc000182000, {0x9c2f20, 0xc0000a6010})
	/home/<user>/concord/backend/internal/platform/recovery/recovery.go:52 +0x45
github.com/gin-gonic/gin.CustomRecoveryWithWriter.func1.1()
	/home/<user>/go/pkg/mod/github.com/gin-gonic/gin@v1.12.0/recovery.go:83 +0x1c5
panic({0x9c2f20?, 0xc0000a6010?})
	/usr/lib/go/src/runtime/panic.go:787 +0x132
gin-quickstart/backend/internal/server.(*Handler).Get(0xc0001a2000, 0xc000182000)
	/home/<user>/concord/backend/internal/server/handler.go:120 +0x2a
github.com/gin-gonic/gin.(*Context).Next(...)
	/home/<user>/go/pkg/mod/github.com/gin-gonic/gin@v1.12.0/context.go:192
gin-quickstart/backend/internal/auth.AuthMiddleware.func1(0xc000182000)
	/home/<user>/concord/backend/internal/auth/middleware.go:56 +0x1b0
created by net/http.(*Server).Serve in goroutine 1
	/usr/lib/go/src/net/http/server.go:3454 +0x485`

func TestParseFrames(t *testing.T) {
	tests := []struct {
		name  string
		stack string
		want  []frame
	}{
		{"v8 com função", "TypeError: x\n    at Xy (assets/index-abc123.js:1:23456)\n    at async Zq (assets/index-abc123.js:2:3)",
			[]frame{{Func: "Xy", File: "assets/index-abc123.js", Line: 1, Col: 23456}, {Func: "Zq", File: "assets/index-abc123.js", Line: 2, Col: 3}}},
		{"v8 sem função", "    at assets/x-AbCdEf12.js:10:20", []frame{{File: "assets/x-AbCdEf12.js", Line: 10, Col: 20}}},
		{"v8 nativo é pulado", "    at Array.forEach (<anonymous>)\n    at new Foo (src/a.ts:1:2)", []frame{{Func: "new Foo", File: "src/a.ts", Line: 1, Col: 2}}},
		{"hermes", "    at anonymous (address at index.android.bundle:1:2345)", []frame{{Func: "anonymous", File: "index.android.bundle", Line: 1, Col: 2345}}},
		{"jsc e firefox", "render@index.android.bundle:1:234\n@assets/y.js:5:6", []frame{{Func: "render", File: "index.android.bundle", Line: 1, Col: 234}, {File: "assets/y.js", Line: 5, Col: 6}}},
		{"go sem runtime, recovery, gin e created by", goPanicStack, []frame{
			{Func: "server.(*Handler).Get", File: "/home/<user>/concord/backend/internal/server/handler.go", Line: 120},
			{Func: "auth.AuthMiddleware.func1", File: "/home/<user>/concord/backend/internal/auth/middleware.go", Line: 56},
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := appFrames(tt.stack); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("appFrames\n got %+v\nwant %+v", got, tt.want)
			}
		})
	}
}

func TestStripViteHash(t *testing.T) {
	tests := map[string]string{
		"index-abc123.js":        "index.js",
		"index-C-TPq1o9.js":      "index.js",
		"index-D8OJ_SLt.js":      "index.js",
		"use-server-D8OJ_SLt.js": "use-server.js",
		"index.js":               "index.js",
		"index.android.bundle":   "index.android.bundle",
		"handler.go":             "handler.go",
		"chunk-BuWvnjlE.mjs":     "chunk.mjs",
	}
	for in, want := range tests {
		if got := stripViteHash(in); got != want {
			t.Errorf("stripViteHash(%q) = %q, quer %q", in, got, want)
		}
	}
}

func TestFingerprint(t *testing.T) {
	base := Fingerprint(SourceRenderer, "TypeError", "falhou no item 3",
		"TypeError: x\n    at Xy (assets/index-abc123.js:1:100)\n    at Zq (assets/index-abc123.js:1:200)")
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(base) {
		t.Fatalf("impressão digital = %q, quer sha256 em hex", base)
	}
	same := Fingerprint(SourceRenderer, "TypeError", "falhou no item 41",
		"TypeError: y\n    at Xy (https://app/assets/index-Zz9_Yy8x.js:7:999)\n    at Zq (assets/index-Zz9_Yy8x.js:3:1)")
	if same != base {
		t.Error("número, linha, coluna e hash do Vite não podem mudar o grupo")
	}
	others := []string{
		Fingerprint(SourceMain, "TypeError", "falhou no item 3", "    at Xy (assets/index-abc123.js:1:100)\n    at Zq (assets/index-abc123.js:1:200)"),
		Fingerprint(SourceRenderer, "RangeError", "falhou no item 3", "    at Xy (assets/index-abc123.js:1:100)\n    at Zq (assets/index-abc123.js:1:200)"),
		Fingerprint(SourceRenderer, "TypeError", "outra mensagem", "    at Xy (assets/index-abc123.js:1:100)\n    at Zq (assets/index-abc123.js:1:200)"),
		Fingerprint(SourceRenderer, "TypeError", "falhou no item 3", "    at Xy (assets/index-abc123.js:1:100)\n    at Ww (assets/index-abc123.js:1:200)"),
	}
	for i, fp := range others {
		if fp == base {
			t.Errorf("caso %d devia ser outro grupo", i)
		}
	}
}

func TestFingerprintGoUsaOsQuadrosDoApp(t *testing.T) {
	a := Fingerprint(SourceBackend, "panic", "runtime error: index out of range [3] with length 2", goPanicStack)
	other := `goroutine 7 [running]:
runtime/debug.Stack()
	/usr/lib/go/src/runtime/debug/stack.go:30 +0x5e
panic({0x1?, 0x2?})
	/usr/lib/go/src/runtime/panic.go:800 +0x132
gin-quickstart/backend/internal/server.(*Handler).Get(0xc0001a9999, 0xc000999999)
	/opt/build/backend/internal/server/handler.go:133 +0x2a
gin-quickstart/backend/internal/auth.AuthMiddleware.func1(0xc000182000)
	/opt/build/backend/internal/auth/middleware.go:60 +0x1b0
created by net/http.(*Server).Serve in goroutine 1
	/usr/lib/go/src/net/http/server.go:3460 +0x485`
	b := Fingerprint(SourceBackend, "panic", "runtime error: index out of range [5] with length 4", other)
	if a != b {
		t.Error("o mesmo panic em outra linha/máquina devia cair no mesmo grupo")
	}
}
