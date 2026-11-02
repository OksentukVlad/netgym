package main

import "context"

// App is the empty Wails backend: the trainers are frontend-only.
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}
