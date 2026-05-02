package ai.alumnium.tool;

import com.fasterxml.jackson.annotation.JsonProperty;

import ai.alumnium.tool.annotation.ToolDescription;
import ai.alumnium.tool.annotation.ToolField;

import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Converts tool records into the JSON schema format expected by the
 * Alumnium server. 
 */
public final class ToolToSchemaConverter {

    private ToolToSchemaConverter() {}

    /**
     * Convert one tool class (must be a {@link Record} implementing
     * {@link BaseTool}) into its schema dict.
     */
    public static Map<String, Object> convert(Class<? extends BaseTool> toolClass) {
        if (!toolClass.isRecord()) {
            throw new IllegalArgumentException(toolClass + " is not a record");
        }

        Map<String, Object> properties = new LinkedHashMap<>();
        List<String> required = new ArrayList<>();

        for (RecordComponent rc : toolClass.getRecordComponents()) {
            String fieldName = fieldName(rc);
            Map<String, Object> typeSchema = toJsonType(rc.getGenericType());

            ToolField tf = rc.getAnnotation(ToolField.class);
            Map<String, Object> prop = new LinkedHashMap<>(typeSchema);
            prop.put("description", tf != null ? tf.description() : fieldName + " parameter");
            properties.put(fieldName, prop);
            required.add(fieldName);
        }

        Map<String, Object> parameters = new LinkedHashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", properties);
        parameters.put("required", required);

        ToolDescription td = toolClass.getAnnotation(ToolDescription.class);
        String description = td != null ? td.value() : "Execute " + toolClass.getSimpleName();

        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", toolClass.getSimpleName());
        function.put("description", description);
        function.put("parameters", parameters);

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "function");
        schema.put("function", function);
        return schema;
    }

    /** Convert a set of tool classes (by name) to a list of schemas. */
    public static List<Map<String, Object>> convertAll(Map<String, Class<? extends BaseTool>> tools) {
        List<Map<String, Object>> schemas = new ArrayList<>(tools.size());
        for (Class<? extends BaseTool> tool : tools.values()) {
            schemas.add(convert(tool));
        }
        return schemas;
    }

    private static String fieldName(RecordComponent rc) {
        JsonProperty jp = rc.getAnnotation(JsonProperty.class);
        if (jp != null && !jp.value().isEmpty()) {
            return jp.value();
        }
        return rc.getName();
    }

    private static Map<String, Object> toJsonType(Type type) {
        if (type instanceof Class<?> cls) {
            if (cls.isEnum()) {
                List<String> values = new ArrayList<>();
                for (Object constant : cls.getEnumConstants()) {
                    values.add(enumValue(constant));
                }
                return ordered(Map.of("type", "string", "enum", values));
            }
            if (cls == int.class || cls == Integer.class
                || cls == long.class || cls == Long.class
                || cls == short.class || cls == Short.class
                || cls == byte.class || cls == Byte.class) {
                return Map.of("type", "integer");
            }
            if (cls == float.class || cls == Float.class
                || cls == double.class || cls == Double.class) {
                return Map.of("type", "number");
            }
            if (cls == boolean.class || cls == Boolean.class) {
                return Map.of("type", "boolean");
            }
            if (cls == String.class || cls == CharSequence.class) {
                return Map.of("type", "string");
            }
            if (Map.class.isAssignableFrom(cls)) {
                return Map.of("type", "object");
            }
            if (List.class.isAssignableFrom(cls)) {
                return ordered(Map.of("type", "array", "items", Map.of("type", "string")));
            }
            return Map.of("type", "string");
        }
        if (type instanceof ParameterizedType pt) {
            Type raw = pt.getRawType();
            if (raw instanceof Class<?> rawCls && List.class.isAssignableFrom(rawCls)) {
                Type[] args = pt.getActualTypeArguments();
                Map<String, Object> items = args.length > 0
                    ? toJsonType(args[0])
                    : Map.of("type", "string");
                return ordered(Map.of("type", "array", "items", items));
            }
            if (raw instanceof Class<?> rawCls && Map.class.isAssignableFrom(rawCls)) {
                return Map.of("type", "object");
            }
        }
        return Map.of("type", "string");
    }

    @SuppressWarnings("unchecked")
    private static String enumValue(Object constant) {
        // Prefer a public "value()" method if present, else fall back to name().
        try {
            return constant.getClass().getMethod("value").invoke(constant).toString();
        } catch (ReflectiveOperationException e) {
            return ((Enum<?>) constant).name();
        }
    }

    private static Map<String, Object> ordered(Map<String, Object> src) {
        return new LinkedHashMap<>(src);
    }
}
