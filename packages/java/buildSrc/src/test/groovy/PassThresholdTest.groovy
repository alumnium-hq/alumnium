import spock.lang.Specification
import spock.lang.Unroll

class PassThresholdTest extends Specification {
    @Unroll
    def 'parses #value as #expected'() {
        expect:
        PassThreshold.parse(value) == expected

        where:
        value  | expected
        null   | 100
        ''     | 100
        '0'    | 0
        '75.1' | 75.1
        '100'  | 100
    }

    @Unroll
    def 'rejects invalid value #value'() {
        when:
        PassThreshold.parse(value)

        then:
        def error = thrown(IllegalArgumentException)
        error.message == "ALUMNIUM_TEST_PASS_THRESHOLD_PCT must be a number from 0 to 100, got '${value}'"

        where:
        value << ['invalid', '-1', '101', 'NaN', 'Infinity']
    }

    def 'accepts exact pass-rate boundary'() {
        expect:
        PassThreshold.evaluate(3, 1, 75) ==
            new PassThreshold.Result(true, '3/4 tests passed (75.00%, required 75%)')
    }

    def 'rejects pass rate below boundary'() {
        expect:
        PassThreshold.evaluate(3, 1, 75.1) ==
            new PassThreshold.Result(false, '3/4 tests passed (75.00%, required 75.1%)')
    }

    def 'rejects empty run'() {
        expect:
        !PassThreshold.evaluate(0, 0, 0).accepted
    }

    def 'apply accepts failures within threshold and returns printed lines'() {
        expect:
        PassThreshold.apply(9, 1, true, 90, false) ==
            ['\nTest failures accepted: 9/10 tests passed (90.00%, required 90%)']
    }

    def 'apply includes GitHub annotation when accepted on CI'() {
        expect:
        PassThreshold.apply(9, 1, true, 90, true) ==
            [
                '\nTest failures accepted: 9/10 tests passed (90.00%, required 90%)',
                '::warning title=Test failures accepted::9/10 tests passed (90.00%, required 90%)'
            ]
    }

    def 'apply throws when failures exceed threshold'() {
        when:
        PassThreshold.apply(9, 1, true, 95, false)

        then:
        def error = thrown(IllegalStateException)
        error.message == '9/10 tests passed (90.00%, required 95%)'
    }

    def 'apply throws for setup or infrastructure errors regardless of threshold'() {
        when:
        PassThreshold.apply(9, 0, true, 0, false)

        then:
        def error = thrown(IllegalStateException)
        error.message == 'System tests had setup or infrastructure errors'
    }

    def 'apply returns no lines when there are no failures'() {
        expect:
        PassThreshold.apply(10, 0, false, 100, false) == []
    }
}
