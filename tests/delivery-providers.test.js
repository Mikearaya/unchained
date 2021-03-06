import {
  setupDatabase,
  createLoggedInGraphqlFetch,
  createAnonymousGraphqlFetch,
} from "./helpers";
import { ADMIN_TOKEN } from "./seeds/users";
import { SimpleDeliveryProvider } from "./seeds/deliveries";

let connection;
let graphqlFetch;
const deliverProviderFrg = {};

describe("DeliveryProviders", () => {
  beforeAll(async () => {
    [, connection] = await setupDatabase();
    graphqlFetch = await createLoggedInGraphqlFetch(ADMIN_TOKEN);
  });

  afterAll(async () => {
    await connection.close();
  });

  describe("Query.deliveryProviders for loggedin user should", () => {
    it("return array of all deliveryProviders when type is not given", async () => {
      const {
        data: { deliveryProviders },
      } = await graphqlFetch({
        query: /* GraphQL */ `
          query DeliveryProviders {
            deliveryProviders {
              _id
              created
              updated
              deleted
              type
              interface {
                _id
                label
                version
              }
              configuration
              configurationError
              isActive
              simulatedPrice {
                _id
                isTaxable
                isNetPrice
                country {
                  _id
                  isoCode
                  isActive
                  isBase
                  defaultCurrency {
                    _id
                    isoCode
                    isActive
                  }
                  flagEmoji
                  name
                }
                price {
                  amount
                  currency
                }
              }
            }
          }
        `,
        variables: {},
      });
      expect(deliveryProviders.length).toEqual(2);
    });

    it("return list of deliveryProviders based on the given type", async () => {
      const {
        data: { deliveryProviders },
      } = await graphqlFetch({
        query: /* GraphQL */ `
          query DeliveryProviders($type: DeliveryProviderType) {
            deliveryProviders(type: $type) {
              _id
            }
          }
        `,
        variables: {
          type: "SHIPPING",
        },
      });
      expect(deliveryProviders.length).toEqual(1);
    });
  });

  describe("Query.deliveryProvider for loggedin user should", () => {
    it("return single deliveryProvider when ID is provided", async () => {
      const {
        data: { deliveryProvider },
      } = await graphqlFetch({
        query: /* GraphQL */ `
          query DeliveryProvider($deliveryProviderId: ID!) {
            deliveryProvider(deliveryProviderId: $deliveryProviderId) {
              _id
              created
              updated
              deleted
              type
              interface {
                _id
                label
                version
              }
              configuration
              configurationError
              isActive
              simulatedPrice {
                _id
                isTaxable
                isNetPrice
                country {
                  _id
                  isoCode
                  isActive
                  isBase
                  defaultCurrency {
                    _id
                    isoCode
                    isActive
                  }
                  flagEmoji
                  name
                }
                price {
                  amount
                  currency
                }
              }
            }
          }
        `,
        variables: {
          deliveryProviderId: SimpleDeliveryProvider._id,
        },
      });
      expect(deliveryProvider._id).toEqual(SimpleDeliveryProvider._id);
    });

    it("return null when non-existing deliveryProviderId is given", async () => {
      const {
        data: { deliveryProvider },
      } = await graphqlFetch({
        query: /* GraphQL */ `
          query DeliveryProvider($deliveryProviderId: ID!) {
            deliveryProvider(deliveryProviderId: $deliveryProviderId) {
              _id
            }
          }
        `,
        variables: {
          deliveryProviderId: "non-existing-id",
        },
      });
      expect(deliveryProvider).toBe(null);
    });
  });

  describe("Query.deliveryProviders for anonymous user should", () => {
    it("return error", async () => {
      const graphqlAnonymousFetch = await createAnonymousGraphqlFetch();
      const { errors } = await graphqlAnonymousFetch({
        query: /* GraphQL */ `
          query DeliveryProviders {
            deliveryProviders {
              _id
            }
          }
        `,
        variables: {},
      });
      expect(errors.length).toEqual(1);
    });
  });
});
