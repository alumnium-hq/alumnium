package ai.alumnium.unit.tool;

import ai.alumnium.tool.ToolToSchemaConverter;
import ai.alumnium.tool.ClickTool;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ToolToSchemaConverterTest {

    @Test
    void convertsClickToolToFunctionSchema() {
        Map<String, Object> schema = ToolToSchemaConverter.convert(ClickTool.class);

        assertThat(schema).containsEntry("type", "function");

        @SuppressWarnings("unchecked")
        Map<String, Object> function = (Map<String, Object>) schema.get("function");
        assertThat(function)
            .containsEntry("name", "ClickTool")
            .containsEntry(
                "description",
                "Click an element. NEVER use ClickTool to upload files - use UploadTool instead.");

        @SuppressWarnings("unchecked")
        Map<String, Object> parameters = (Map<String, Object>) function.get("parameters");
        assertThat(parameters).containsEntry("type", "object");

        @SuppressWarnings("unchecked")
        Map<String, Object> properties = (Map<String, Object>) parameters.get("properties");
        @SuppressWarnings("unchecked")
        Map<String, Object> idProp = (Map<String, Object>) properties.get("id");
        assertThat(idProp)
            .containsEntry("type", "integer")
            .containsEntry("description", "Element identifier (ID)");

        @SuppressWarnings("unchecked")
        List<String> required = (List<String>) parameters.get("required");
        assertThat(required).containsExactly("id");
    }

    @Test
    void convertAllReturnsOneSchemaPerTool() {
        List<Map<String, Object>> schemas =
            ToolToSchemaConverter.convertAll(Map.of("ClickTool", ClickTool.class));

        assertThat(schemas).hasSize(1);
        assertThat(schemas.get(0)).containsEntry("type", "function");
    }
}
