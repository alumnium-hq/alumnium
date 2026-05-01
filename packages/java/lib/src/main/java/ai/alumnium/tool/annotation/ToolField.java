package ai.alumnium.tool.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Documents a tool record component so
 * {@link ToolToSchemaConverter} can emit a meaningful JSON schema. 
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.RECORD_COMPONENT, ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
public @interface ToolField {
    /** Human-readable description of the field, surfaced to the server. */
    String description();
}
