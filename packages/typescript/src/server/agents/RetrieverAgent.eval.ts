import { evalite } from "evalite";
import { nanoid } from "nanoid";
import { lit } from "smollit";
import type { AppId } from "../../AppId.ts";
import { Model } from "../../Model.ts";
import { Logger } from "../../telemetry/Logger.ts";
import { NullCache } from "../cache/NullCache.ts";
import { LlmContext } from "../LlmContext.ts";
import { LlmFactory } from "../LlmFactory.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { RetrieverAgent } from "./RetrieverAgent.ts";

Logger.level = "warning";

let TRIAL_COUNT = parseInt(process.env.ALUMNIUM_EVAL_TRIAL_COUNT || "25");
if (isNaN(TRIAL_COUNT) || TRIAL_COUNT <= 0) TRIAL_COUNT = 25;

evalite("RetrieverAgent", {
  data: [
    {
      input: {
        statement: "the total number of profile images",
        treeXml: lit`
          <RootWebArea name="The Internet" focusable="true" focused="true" url="https://the-internet.herokuapp.com/dynamic_content">
            <generic>
              <link name="" focusable="true" url="https://github.com/tourdedave/the-internet">
                <image name="Fork me on GitHub" url="https://the-internet.herokuapp.com/img/forkme_right_green_007200.png"/>
              </link>
              <generic>
                <heading level="3">
                  Dynamic Content
                </heading>
                <paragraph>
                  This example demonstrates the ever-evolving nature of content by loading new text and images on each page refresh.
                </paragraph>
                <paragraph>
                  To make some of the content static append
                  <code>
                    ?with_content=static
                  </code>
                  or
                  <link focusable="true" url="https://the-internet.herokuapp.com/dynamic_content?with_content=static">
                    click here
                  </link>
                  .
                </paragraph>
                <separator settable="true" orientation="horizontal"/>
                <LineBreak name="">
                  <InlineTextBox name=""/>
                </LineBreak>
                <LineBreak name="">
                  <InlineTextBox name=""/>
                </LineBreak>
                <generic>
                  <generic>
                    <image url="https://the-internet.herokuapp.com/img/avatars/Original-Facebook-Geek-Profile-Avatar-7.jpg"/>
                  </generic>
                  <generic>
                    Tenetur saepe nihil laudantium voluptates repudiandae illum enim sunt facilis impedit atque optio ex nostrum provident quaerat voluptatem dolores dicta animi sapiente ullam quis temporibus nesciunt veritatis eos similique architecto.
                  </generic>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                  <generic>
                    <image url="https://the-internet.herokuapp.com/img/avatars/Original-Facebook-Geek-Profile-Avatar-1.jpg"/>
                  </generic>
                  <generic>
                    Dignissimos libero et harum dolorem fuga unde ex mollitia distinctio adipisci cumque occaecati ea iure recusandae reiciendis maiores molestiae consectetur quidem consequatur ab commodi et dolor optio debitis rerum sunt tenetur et.
                  </generic>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                  <generic>
                    <image url="https://the-internet.herokuapp.com/img/avatars/Original-Facebook-Geek-Profile-Avatar-5.jpg"/>
                  </generic>
                  <generic>
                    Laudantium optio ut dolor sapiente alias dolores magni accusantium illo et molestiae blanditiis non omnis nesciunt iure maxime totam voluptatem eos nisi odio animi saepe harum praesentium hic voluptatem recusandae molestiae eaque veniam.
                  </generic>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                  <LineBreak name="">
                    <InlineTextBox name=""/>
                  </LineBreak>
                </generic>
              </generic>
              <generic>
                <generic>
                  <separator settable="true" orientation="horizontal"/>
                  <generic>
                    Powered by
                    <link focusable="true" url="http://elementalselenium.com/">
                      Elemental Selenium
                    </link>
                  </generic>
                </generic>
              </generic>
            </generic>
          </RootWebArea>
        `,
        title: "The Internet",
        url: "https://the-internet.herokuapp.com/dynamic_content",
        screenshot: null,
      },
      expected: "3",
    },
  ],

  scorers: [
    {
      name: "Gives correct answer",
      description: "Checks correctness of the retrieved information.",
      scorer: ({ output, expected }) => {
        const parsed = RetrieverAgent.Output.safeParse(output);
        if (!parsed.success) return 0;
        return parsed.data[1] === expected ? 1 : 0;
      },
    },
  ],

  trialCount: TRIAL_COUNT,

  columns: ({ output, expected }) => {
    const parsed = RetrieverAgent.Output.safeParse(output);
    return [
      { label: "Expected", value: expected },
      {
        label: "Value",
        value: parsed.data?.[1] ?? "-",
      },
      {
        label: "Explanation",
        value: parsed.data?.[0] ?? "-",
      },
    ];
  },

  task: async (input) => {
    const model = Model.current;
    const llmContext = new LlmContext(model);
    const sessionContext = new SessionContext({
      app: "eval" as AppId,
      sessionId: nanoid(),
    });
    const cache = new NullCache(sessionContext);
    const llm = LlmFactory.createLlm(model, cache);
    const agent = new RetrieverAgent(llmContext, llm);

    return agent.invoke(input);
  },
});
