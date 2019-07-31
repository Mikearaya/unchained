export default [
  /* GraphQL */ `
    """
    A Bundle product consists of multiple configured products
    """
    type BundleProduct implements Product {
      _id: ID!
      sequence: Int!
      status: ProductStatus!
      tags: [String!]
      created: Date
      updated: Date
      published: Date
      media(vectors: [ProductAssignmentVectorInput!]): [ProductMedia!]
      texts(forceLocale: String): ProductTexts
      bundleItems: [ProductBundleItem!]
      reviews(limit: Int = 10, offset: Int = 0): [ProductReview!]!
      assortments(limit: Int = 10, offset: Int = 0): [Assortment!]!
        @deprecated(
          reason: "Please use assortmentPaths to get the parent assortments"
        )
      assortmentPaths(forceLocale: String): [ProductAssortmentPath!]!
      meta: JSON
    }

    type ProductBundleItem {
      product: Product!
      quantity: Int!
      configuration: [ProductConfigurationParameter!]
    }
  `
];
