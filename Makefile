.DEFAULT_GOAL := help
.PHONY: help init doctor dev build release install test test-db test-coverage test-coverage-db docs license-check content review
init:
	./scripts/init.sh
help doctor dev build release install test test-db test-coverage test-coverage-db docs license-check content review:
	node scripts/tasks.mjs $@
