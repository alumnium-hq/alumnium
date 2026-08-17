import groovy.transform.Immutable

final class PassThreshold {
    static final String ENV_NAME = 'ALUMNIUM_TEST_PASS_THRESHOLD_PCT'

    static double parse(String value) {
        if (!value) {
            return 100
        }

        double threshold
        try {
            threshold = Double.parseDouble(value)
        } catch (NumberFormatException error) {
            throw invalid(value, error)
        }

        if (!Double.isFinite(threshold) || threshold < 0 || threshold > 100) {
            throw invalid(value)
        }
        threshold
    }

    static Result evaluate(int passed, int failed, double threshold) {
        int total = passed + failed
        double passRate = total ? (double) passed / total * 100 : 0
        String message = String.format(
            Locale.ROOT,
            '%d/%d tests passed (%.2f%%, required %s%%)',
            passed,
            total,
            passRate,
            formatThreshold(threshold)
        )
        new Result(total > 0 && passRate >= threshold, message)
    }

    /**
     * Applies the pass-threshold decision for a completed system test run,
     * printing the appropriate console/GitHub Actions output and throwing if
     * the run should be considered a failure.
     *
     * @return the list of printed lines, for testing purposes.
     */
    static List<String> apply(int passed, int failed, boolean hasGradleFailures, double threshold, boolean githubActions) {
        List<String> lines = []

        if (hasGradleFailures && failed == 0) {
            throw new IllegalStateException('System tests had setup or infrastructure errors')
        }

        if (failed == 0) {
            return lines
        }

        Result result = evaluate(passed, failed, threshold)

        if (result.accepted) {
            lines << "\nTest failures accepted: ${result.message}".toString()
            if (githubActions) {
                lines << "::warning title=Test failures accepted::${result.message}".toString()
            }
        } else {
            lines << "\nTest failures exceeded threshold: ${result.message}".toString()
            if (githubActions) {
                lines << "::error title=Test failures exceeded threshold::${result.message}".toString()
            }
            lines.each { println it }
            throw new IllegalStateException(result.message)
        }

        lines.each { println it }
        lines
    }

    private static IllegalArgumentException invalid(String value, Throwable cause = null) {
        String message = "${ENV_NAME} must be a number from 0 to 100, got '${value}'"
        cause ? new IllegalArgumentException(message, cause) : new IllegalArgumentException(message)
    }

    private static String formatThreshold(double threshold) {
        threshold == Math.rint(threshold) ? Long.toString((long) threshold) : Double.toString(threshold)
    }

    @Immutable
    static class Result {
        boolean accepted
        String message
    }
}
