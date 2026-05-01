package ai.alumnium.client;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Result payload returned from the server for {@code check()} / {@code get()}.
 *
 * Java's type system can't express that directly, so {@code Data} is a
 * sealed interface with concrete record implementations. The static
 * {@link #looselyTypecast(Object)} method is a port of the Python
 * function.
 */
public sealed interface Data
    permits Data.NoopData, Data.StringData, Data.IntData, Data.FloatData, Data.BoolData, Data.ListData {

    /** Returns the wrapped value as an {@code Object} (or {@code null} for {@link NoopData}). */
    Object boxedValue();

    default boolean isNoop() { return this instanceof NoopData; }

    default String asString() {
        return switch (this) {
            case NoopData n -> null;
            case StringData s -> s.value();
            case IntData i -> Long.toString(i.value());
            case FloatData f -> Double.toString(f.value());
            case BoolData b -> Boolean.toString(b.value());
            case ListData l -> l.value().toString();
        };
    }

    /**
     * Convert into a plain Java structure ({@code String}, {@code Long},
     * {@code Double}, {@code Boolean}, or {@code List}) suitable for direct
     * comparison in tests with {@code assertj} / {@code equals()}.
     */
    default Object toObject() {
        return switch (this) {
            case NoopData n -> null;
            case StringData s -> s.value();
            case IntData i -> i.value();
            case FloatData f -> f.value();
            case BoolData b -> b.value();
            case ListData l -> {
                List<Object> out = new ArrayList<>(l.value().size());
                for (Data item : l.value()) {
                    out.add(item.toObject());
                }
                yield out;
            }
        };
    }

    /** Represents the Python {@code None} (when value is the literal "NOOP"). */
    record NoopData() implements Data {
        public static final NoopData INSTANCE = new NoopData();
        @Override public Object boxedValue() { return null; }
    }

    record StringData(String value) implements Data {
        public StringData { Objects.requireNonNull(value, "value"); }
        @Override public Object boxedValue() { return value; }
    }

    record IntData(long value) implements Data {
        @Override public Object boxedValue() { return value; }
    }

    record FloatData(double value) implements Data {
        @Override public Object boxedValue() { return value; }
    }

    record BoolData(boolean value) implements Data {
        @Override public Object boxedValue() { return value; }
    }

    record ListData(List<Data> value) implements Data {
        public ListData {
            value = value == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(value));
        }
        @Override public Object boxedValue() { return value; }
    }

    /**
     * Port of
     * {@code packages/python/src/alumnium/clients/typecasting.py::loosely_typecast}.
     * Accepts a {@code String} or a {@code List} of items. Items may themselves
     * be strings or already-coerced primitives (useful when the server already
     * returned typed JSON).
     */
    static Data looselyTypecast(Object value) {
        if (value == null) {
            return NoopData.INSTANCE;
        }
        if (value instanceof List<?> list) {
            List<Data> items = new ArrayList<>(list.size());
            for (Object item : list) {
                items.add(looselyTypecast(item));
            }
            return new ListData(items);
        }
        if (value instanceof Boolean b) return new BoolData(b);
        if (value instanceof Integer i) return new IntData(i.longValue());
        if (value instanceof Long l)    return new IntData(l);
        if (value instanceof Short s)   return new IntData(s.longValue());
        if (value instanceof Byte by)   return new IntData(by.longValue());
        if (value instanceof Float f)   return new FloatData(f.doubleValue());
        if (value instanceof Double d)  return new FloatData(d);

        String raw = value.toString().strip();

        if (raw.equalsIgnoreCase("NOOP")) {
            return NoopData.INSTANCE;
        }
        if (isAllDigits(raw)) {
            try {
                return new IntData(Long.parseLong(raw));
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        if (isDecimal(raw)) {
            try {
                return new FloatData(Double.parseDouble(raw));
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        if (raw.equalsIgnoreCase("true"))  return new BoolData(true);
        if (raw.equalsIgnoreCase("false")) return new BoolData(false);

        return new StringData(stripQuotesAndWhitespace(raw));
    }

    private static boolean isAllDigits(String s) {
        if (s.isEmpty()) return false;
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) return false;
        }
        return true;
    }

    private static boolean isDecimal(String s) {
        if (s.isEmpty()) return false;
        boolean dot = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '.' && !dot) {
                dot = true;
                continue;
            }
            if (!Character.isDigit(c)) return false;
        }
        return dot;
    }

    private static String stripQuotesAndWhitespace(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && isStripChar(s.charAt(start))) start++;
        while (end > start && isStripChar(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }

    private static boolean isStripChar(char c) {
        // Matches Python's string.whitespace plus the single/double quote
        // characters, per loosely_typecast().
        return Character.isWhitespace(c) || c == '\'' || c == '"';
    }
}
