import { requireCustomer, route } from '@/lib/http';
import { addToCart, removeFromCart } from '@/server/services/posts';

export const POST = route(async (req, { params }) => addToCart(await requireCustomer(req), params.postId));

export const DELETE = route(async (req, { params }) => removeFromCart(await requireCustomer(req), params.postId));
