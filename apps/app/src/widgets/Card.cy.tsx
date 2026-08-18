import Card, { CardContent } from "./Card";
import { Content } from "../types";

const outletContext = {
  user: undefined,
  setAddTo: () => {},
  allLicenses: [],
};

function docContent(overrides: Partial<Content> = {}): Content {
  return {
    contentId: "doc1",
    name: "A document",
    type: "singleDoc",
    isPublic: false,
    isShared: false,
    visibility: "private",
    licenseCode: null,
    categories: [],
    numVariants: 1,
    ...overrides,
  } as unknown as Content;
}

describe("Card repeat control", { tags: ["@group4"] }, () => {
  function mountRepeatCard(cardContent: Partial<CardContent>) {
    cy.mount(
      <Card
        cardContent={
          {
            content: docContent({ numVariants: 5 }),
            ...cardContent,
          } as CardContent
        }
      />,
      { outletContext },
    );
  }

  it("is absent unless the document is inside a problem set", () => {
    mountRepeatCard({});
    cy.get('input[aria-label^="Number of times to repeat"]').should(
      "not.exist",
    );
  });

  // Assigned (and otherwise read-only) content supplies no updater: changing
  // the repeat would renumber the items, so the server rejects it.
  it("is disabled, but still shows its value, without an update callback", () => {
    mountRepeatCard({ repeatInProblemSet: 3 });

    cy.get('input[aria-label^="Number of times to repeat"]')
      .should("have.value", "3")
      .should("be.disabled");
  });

  it("reports a new value to the update callback", () => {
    const updateRepeatInProblemSet = cy.stub().as("updateRepeat");
    mountRepeatCard({ repeatInProblemSet: 3, updateRepeatInProblemSet });

    cy.get('input[aria-label^="Number of times to repeat"]')
      .should("be.enabled")
      .clear()
      .type("2{enter}");
    cy.get("@updateRepeat").should("have.been.calledWith", 2);
  });
});
